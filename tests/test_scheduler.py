"""Scheduler tests for plan 001 (house and conditional schedules)."""
from __future__ import annotations

import unittest
from datetime import datetime

import ha_stubs

MODS = ha_stubs.load_modules()
EnvironmentalScheduler = MODS["scheduler"].EnvironmentalScheduler
SchedulerStore = MODS["storage"].SchedulerStore
Block = MODS["models"].Block
Room = MODS["models"].Room
DOMAIN = MODS["const"].DOMAIN


def _new_scheduler():
    hass = ha_stubs.FakeHass()
    return hass, EnvironmentalScheduler(hass, SchedulerStore(hass))


class HotWaterControlTests(unittest.IsolatedAsyncioTestCase):
    async def _service_for(self, entity_id: str, reason: str) -> dict:
        hass, scheduler = _new_scheduler()
        await scheduler._control_hot_water(entity_id, reason)
        self.assertEqual(len(hass.services.calls), 1)
        return hass.services.calls[0]

    async def test_schedule_reasons_turn_on(self) -> None:
        for reason in ("schedule", "schedule_occupied"):
            with self.subTest(reason=reason):
                call = await self._service_for("switch.hot_water", reason)
                self.assertEqual(call["domain"], "switch")
                self.assertEqual(call["service"], "turn_on")
                self.assertEqual(call["data"], {"entity_id": "switch.hot_water"})

    async def test_other_reasons_turn_off(self) -> None:
        for reason in ("away", "fallback", "vacation", "persons_away"):
            with self.subTest(reason=reason):
                call = await self._service_for("switch.hot_water", reason)
                self.assertEqual(call["domain"], "switch")
                self.assertEqual(call["service"], "turn_off")


class PreBlockStartTests(unittest.IsolatedAsyncioTestCase):
    # 2026-10-19 is a Monday; 06:30 is 30 minutes before the 07:00 blocks
    NOW = datetime(2026, 10, 19, 6, 30)

    def _setup(self, follow: bool):
        hass, scheduler = _new_scheduler()
        store = scheduler._store
        store.get_config().node_red_mode = True
        room = Room(
            id="lounge", name="Lounge", climate_entities=["climate.lounge"],
            preheat_offset_minutes=30, follow_house_schedule=follow,
        )
        room_block = Block.new("07:00", "09:00", 17.0)
        room.weekly_schedule["monday"] = [room_block]
        store.add_room(room)
        house_block = Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
        store._house_schedule["monday"] = [house_block]
        return hass, scheduler, room_block, house_block

    def _pre_block_events(self, hass) -> list[dict]:
        return [data for name, data in hass.bus.events if name == f"{DOMAIN}.pre_block_start"]

    async def test_following_room_fires_for_house_block(self) -> None:
        hass, scheduler, _, house_block = self._setup(follow=True)
        await scheduler._tick(self.NOW)
        events = self._pre_block_events(hass)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["room"], "lounge")
        self.assertEqual(events[0]["block"]["id"], house_block.id)
        self.assertEqual(events[0]["block"]["occupied_temperature"], 21.0)

    async def test_non_following_room_fires_for_own_block(self) -> None:
        hass, scheduler, room_block, _ = self._setup(follow=False)
        await scheduler._tick(self.NOW)
        events = self._pre_block_events(hass)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["room"], "lounge")
        self.assertEqual(events[0]["block"], room_block.to_dict())


class PreHeatSetpointTests(unittest.IsolatedAsyncioTestCase):
    # 2026-10-19 is a Monday; 06:30 is 30 minutes before the 07:00 block
    NOW = datetime(2026, 10, 19, 6, 30)
    OCCUPANCY_ENTITY = "binary_sensor.house_occupied"

    def _setup(self, occupancy: str, occupied_temperature: float | None = 21.0):
        hass, scheduler = _new_scheduler()
        store = scheduler._store
        store.get_config().node_red_mode = False
        store.get_config().house_occupancy_entity = self.OCCUPANCY_ENTITY
        hass.states.set(self.OCCUPANCY_ENTITY, occupancy)
        room = Room(
            id="lounge", name="Lounge", climate_entities=["climate.lounge"],
            preheat_offset_minutes=30,
        )
        room.weekly_schedule["monday"] = [
            Block.new("07:00", "09:00", 18.0, occupied_temperature=occupied_temperature)
        ]
        store.add_room(room)
        return hass, scheduler

    def _set_temperatures(self, hass) -> list[float]:
        return [
            call["data"]["temperature"] for call in hass.services.calls
            if call["domain"] == "climate" and call["service"] == "set_temperature"
        ]

    async def test_occupied_sets_occupied_temperature(self) -> None:
        hass, scheduler = self._setup("on")
        await scheduler._tick(self.NOW)
        self.assertEqual(self._set_temperatures(hass)[0], 21.0)

    async def test_not_occupied_sets_base_temperature(self) -> None:
        hass, scheduler = self._setup("off")
        await scheduler._tick(self.NOW)
        self.assertEqual(self._set_temperatures(hass)[0], 18.0)

    async def test_no_occupied_value_sets_base_temperature(self) -> None:
        hass, scheduler = self._setup("on", occupied_temperature=None)
        await scheduler._tick(self.NOW)
        self.assertEqual(self._set_temperatures(hass)[0], 18.0)

    async def test_current_state_applied_after_preheat_in_same_tick(self) -> None:
        hass, scheduler = self._setup("on")
        await scheduler._tick(self.NOW)
        current = scheduler._store.get_active_block("lounge", self.NOW)["target_temperature"]
        self.assertEqual(self._set_temperatures(hass), [21.0, current])


class OccupancyChangeTests(unittest.IsolatedAsyncioTestCase):
    # 2026-10-19 is a Monday; 08:00 and 08:01 are inside the 07:00 to 09:00 block
    FIRST_TICK = datetime(2026, 10, 19, 8, 0)
    NEXT_TICK = datetime(2026, 10, 19, 8, 1)
    OCCUPANCY_ENTITY = "binary_sensor.house_occupied"

    def _set_temperatures(self, hass) -> list[float]:
        return [
            call["data"]["temperature"] for call in hass.services.calls
            if call["domain"] == "climate" and call["service"] == "set_temperature"
        ]

    async def test_occupancy_change_during_active_block_updates_next_tick(self) -> None:
        hass, scheduler = _new_scheduler()
        store = scheduler._store
        store.get_config().node_red_mode = False
        store.get_config().house_occupancy_entity = self.OCCUPANCY_ENTITY
        hass.states.set(self.OCCUPANCY_ENTITY, "off")
        room = Room(id="lounge", name="Lounge", climate_entities=["climate.lounge"])
        room.weekly_schedule["monday"] = [
            Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
        ]
        store.add_room(room)

        await scheduler._tick(self.FIRST_TICK)
        self.assertEqual(self._set_temperatures(hass), [18.0])

        hass.states.set(self.OCCUPANCY_ENTITY, "on")
        await scheduler._tick(self.NEXT_TICK)
        self.assertEqual(self._set_temperatures(hass), [18.0, 21.0])


if __name__ == "__main__":
    unittest.main()
