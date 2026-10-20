"""Store tests for plan 001 (house and conditional schedules)."""
from __future__ import annotations

import unittest
from datetime import datetime

import ha_stubs

MODS = ha_stubs.load_modules()
SchedulerStore = MODS["storage"].SchedulerStore
Block = MODS["models"].Block
Room = MODS["models"].Room
Person = MODS["models"].Person
ValidationError = MODS["models"].ValidationError
DAYS_OF_WEEK = MODS["const"].DAYS_OF_WEEK


def _new_store(data: dict | None = None):
    store = SchedulerStore(ha_stubs.FakeHass())
    store._store.data = data
    return store


class HouseScheduleStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_default_is_seven_empty_days(self) -> None:
        store = _new_store()
        await store.async_load()
        self.assertEqual(store._house_schedule, {day: [] for day in DAYS_OF_WEEK})
        await store.async_save()
        self.assertEqual(
            store._store.data["house_schedule"], {day: [] for day in DAYS_OF_WEEK}
        )

    async def test_save_then_load_keeps_house_blocks(self) -> None:
        store = _new_store()
        await store.async_load()
        monday = Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
        sunday = Block.new("17:00", "22:00", 20.0)
        store._house_schedule["monday"] = [monday]
        store._house_schedule["sunday"] = [sunday]
        await store.async_save()

        reloaded = _new_store(store._store.data)
        await reloaded.async_load()
        self.assertEqual(reloaded._house_schedule["monday"], [monday])
        self.assertEqual(reloaded._house_schedule["sunday"], [sunday])
        for day in DAYS_OF_WEEK:
            if day not in ("monday", "sunday"):
                self.assertEqual(reloaded._house_schedule[day], [])
        self.assertEqual(set(reloaded._house_schedule), set(DAYS_OF_WEEK))

    async def test_old_format_loads_empty_house_and_unchanged_rooms(self) -> None:
        room = Room(id="lounge", name="Lounge", climate_entities=["climate.lounge"])
        room.weekly_schedule["tuesday"] = [Block.new("06:30", "08:00", 19.5)]
        old_data = {
            "config": {},
            "rooms": [room.to_dict()],
        }
        store = _new_store(old_data)
        await store.async_load()
        self.assertEqual(store._house_schedule, {day: [] for day in DAYS_OF_WEEK})
        self.assertEqual(store.get_rooms(), [room])
        self.assertEqual(store.get_room("lounge"), room)

    async def test_remove_then_new_store_loads_no_rooms(self) -> None:
        hass = ha_stubs.FakeHass()
        store = SchedulerStore(hass)
        await store.async_load()
        store.add_room(Room(id="lounge", name="Lounge", climate_entities=["climate.lounge"]))
        await store.async_save()
        await store.async_remove()

        reloaded = SchedulerStore(hass)
        await reloaded.async_load()
        self.assertEqual(reloaded.get_rooms(), [])

    async def test_save_without_remove_new_store_loads_saved_rooms(self) -> None:
        hass = ha_stubs.FakeHass()
        store = SchedulerStore(hass)
        await store.async_load()
        room = Room(id="lounge", name="Lounge", climate_entities=["climate.lounge"])
        store.add_room(room)
        await store.async_save()

        reloaded = SchedulerStore(hass)
        await reloaded.async_load()
        self.assertEqual(reloaded.get_rooms(), [room])


def _store_with_room():
    store = _new_store()
    store.add_room(Room(id="lounge", name="Lounge", climate_entities=["climate.lounge"]))
    return store


class TargetBlockOperationTests(unittest.TestCase):
    def test_house_commit_and_get_blocks(self) -> None:
        store = _store_with_room()
        block = Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
        store.commit_block(None, "monday", block, [])
        self.assertEqual(store._house_schedule["monday"], [block])
        self.assertEqual(store.get_blocks(None, "monday"), [block])
        self.assertEqual(store.get_blocks(None), [block])
        self.assertEqual(store.get_blocks("lounge"), [])

    def test_house_overlap_report(self) -> None:
        store = _store_with_room()
        long_block = Block.new("06:00", "09:00", 18.0)
        short_block = Block.new("10:00", "10:40", 18.0)
        store.commit_block(None, "monday", long_block, [])
        store.commit_block(None, "monday", short_block, [])
        new_block = Block.new("08:00", "10:30", 20.0)
        conflicts = store.check_overlaps(None, "monday", new_block)
        actions = {c.block.id: c.action for c in conflicts}
        self.assertEqual(actions, {long_block.id: "trim", short_block.id: "delete"})

    def test_house_forced_trim_and_delete(self) -> None:
        store = _store_with_room()
        long_block = Block.new("06:00", "09:00", 18.0, occupied_temperature=21.0)
        short_block = Block.new("10:00", "10:40", 18.0)
        store.commit_block(None, "monday", long_block, [])
        store.commit_block(None, "monday", short_block, [])
        new_block = Block.new("08:00", "10:30", 20.0)
        conflicts = store.check_overlaps(None, "monday", new_block)
        store.commit_block(None, "monday", new_block, conflicts)
        blocks = store.get_day(None, "monday")
        self.assertEqual([b.id for b in blocks], [long_block.id, new_block.id])
        self.assertEqual(blocks[0].end_time, "08:00")
        self.assertEqual(blocks[0].occupied_temperature, 21.0)

    def test_house_delete_block(self) -> None:
        store = _store_with_room()
        block = Block.new("07:00", "09:00", 18.0)
        store.commit_block(None, "monday", block, [])
        store.delete_block(None, "monday", block.id)
        self.assertEqual(store.get_day(None, "monday"), [])
        with self.assertRaises(ValueError):
            store.delete_block(None, "monday", block.id)

    def test_invalid_house_block_rejected(self) -> None:
        store = _store_with_room()
        with self.assertRaises(ValidationError):
            store.commit_block(None, "monday", Block.new("09:00", "07:00", 18.0), [])
        with self.assertRaises(ValidationError):
            store.commit_block(
                None, "monday", Block.new("07:00", "09:00", 18.0, occupied_temperature=40.0), []
            )
        self.assertEqual(store.get_day(None, "monday"), [])

    def test_invalid_room_occupied_temperature_rejected(self) -> None:
        store = _store_with_room()
        with self.assertRaises(ValidationError):
            store.commit_block(
                "lounge", "monday", Block.new("07:00", "09:00", 18.0, occupied_temperature=21.3), []
            )
        self.assertEqual(store.get_day("lounge", "monday"), [])

    def test_trimmed_room_block_keeps_occupied_temperature(self) -> None:
        store = _store_with_room()
        existing = Block.new("08:00", "12:00", 18.0, occupied_temperature=22.0)
        store.commit_block("lounge", "tuesday", existing, [])
        new_block = Block.new("07:00", "09:00", 20.0)
        conflicts = store.check_overlaps("lounge", "tuesday", new_block)
        self.assertEqual([c.action for c in conflicts], ["trim"])
        store.commit_block("lounge", "tuesday", new_block, conflicts)
        blocks = store.get_day("lounge", "tuesday")
        self.assertEqual([b.id for b in blocks], [new_block.id, existing.id])
        self.assertEqual(blocks[1].start_time, "09:00")
        self.assertEqual(blocks[1].occupied_temperature, 22.0)

    def test_get_day_and_set_day_on_room_and_house(self) -> None:
        store = _store_with_room()
        room_blocks = [Block.new("06:00", "07:00", 19.0)]
        house_blocks = [Block.new("18:00", "22:00", 20.0, occupied_temperature=21.5)]
        store.set_day("lounge", "friday", room_blocks)
        store.set_day(None, "friday", house_blocks)
        self.assertEqual(store.get_day("lounge", "friday"), room_blocks)
        self.assertEqual(store.get_day(None, "friday"), house_blocks)
        self.assertEqual(store.get_room("lounge").weekly_schedule["friday"], room_blocks)
        self.assertEqual(store._house_schedule["friday"], house_blocks)

    def test_unknown_room_raises(self) -> None:
        store = _store_with_room()
        with self.assertRaises(ValueError):
            store.get_day("missing", "monday")
        with self.assertRaises(ValueError):
            store.commit_block("missing", "monday", Block.new("07:00", "09:00", 18.0), [])


OCCUPANCY_ENTITY = "binary_sensor.house_occupied"


def _store_with_occupancy(state: str | None):
    """Store with the occupancy entity configured; state None leaves it missing."""
    store = _store_with_room()
    store._config.house_occupancy_entity = OCCUPANCY_ENTITY
    if state is not None:
        store._hass.states.set(OCCUPANCY_ENTITY, state)
    return store


class HelperTests(unittest.TestCase):
    def test_effective_days_non_following_uses_room_schedule(self) -> None:
        store = _store_with_room()
        room = store.get_room("lounge")
        room.weekly_schedule["monday"] = [Block.new("06:00", "07:00", 19.0)]
        store._house_schedule["monday"] = [Block.new("18:00", "22:00", 20.0)]
        self.assertIs(store.effective_days(room), room.weekly_schedule)

    def test_effective_days_following_uses_house_schedule(self) -> None:
        store = _store_with_room()
        room = store.get_room("lounge")
        room_blocks = [Block.new("06:00", "07:00", 19.0)]
        room.weekly_schedule["monday"] = room_blocks
        store._house_schedule["monday"] = [Block.new("18:00", "22:00", 20.0)]
        room.follow_house_schedule = True
        self.assertIs(store.effective_days(room), store._house_schedule)
        # The room's own blocks stay in storage unchanged (R4)
        self.assertEqual(room.weekly_schedule["monday"], room_blocks)

    def test_house_occupied_on(self) -> None:
        self.assertTrue(_store_with_occupancy("on").house_occupied())

    def test_house_occupied_off(self) -> None:
        self.assertFalse(_store_with_occupancy("off").house_occupied())

    def test_house_occupied_unavailable(self) -> None:
        self.assertFalse(_store_with_occupancy("unavailable").house_occupied())

    def test_house_occupied_unknown(self) -> None:
        self.assertFalse(_store_with_occupancy("unknown").house_occupied())

    def test_house_occupied_missing_entity(self) -> None:
        self.assertFalse(_store_with_occupancy(None).house_occupied())
        store = _store_with_occupancy("on")
        store._hass.states.remove(OCCUPANCY_ENTITY)
        self.assertFalse(store.house_occupied())

    def test_house_occupied_unset(self) -> None:
        store = _store_with_room()
        store._hass.states.set(OCCUPANCY_ENTITY, "on")
        self.assertIsNone(store._config.house_occupancy_entity)
        self.assertFalse(store.house_occupied())

    def test_resolve_block_with_occupied_temperature_when_occupied(self) -> None:
        store = _store_with_occupancy("on")
        block = Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
        self.assertEqual(store.resolve_block(block), (21.0, "schedule_occupied"))

    def test_resolve_block_with_occupied_temperature_when_not_occupied(self) -> None:
        store = _store_with_occupancy("off")
        block = Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
        self.assertEqual(store.resolve_block(block), (18.0, "schedule"))

    def test_resolve_block_without_occupied_temperature_when_occupied(self) -> None:
        store = _store_with_occupancy("on")
        block = Block.new("07:00", "09:00", 18.0)
        self.assertEqual(store.resolve_block(block), (18.0, "schedule"))

    def test_resolve_block_without_occupied_temperature_when_not_occupied(self) -> None:
        store = _store_with_occupancy("off")
        block = Block.new("07:00", "09:00", 18.0)
        self.assertEqual(store.resolve_block(block), (18.0, "schedule"))


# 2024-01-01 is a Monday
MONDAY_8AM = datetime(2024, 1, 1, 8, 0)
ACTIVE_KEYS = {"active_block", "target_temperature", "reason"}


def _active_store(occupancy: str | None = "on"):
    """Store whose lounge has a Monday 07:00-09:00 block with an occupied temperature."""
    store = _store_with_occupancy(occupancy)
    room = store.get_room("lounge")
    room.weekly_schedule["monday"] = [
        Block.new("07:00", "09:00", 18.0, occupied_temperature=21.0)
    ]
    return store


class GetActiveBlockTests(unittest.TestCase):
    def test_vacation_unchanged(self) -> None:
        store = _active_store()
        store._config.house_mode = "vacation"
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(result, {
            "active_block": None,
            "target_temperature": store._config.vacation_temp,
            "reason": "vacation",
        })

    def test_away_unchanged(self) -> None:
        store = _active_store()
        store._config.house_mode = "away"
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(result, {
            "active_block": None,
            "target_temperature": store._config.global_away_temp,
            "reason": "away",
        })

    def test_persons_away_unchanged(self) -> None:
        store = _active_store()
        store._config.persons = [Person(id="dave", name="Dave", ha_entity="person.dave")]
        store._hass.states.set("person.dave", "not_home")
        store.get_room("lounge").persons = ["dave"]
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(result, {
            "active_block": None,
            "target_temperature": store._config.global_away_temp,
            "reason": "persons_away",
        })

    def test_schedule_occupied_uses_occupied_temperature(self) -> None:
        store = _active_store("on")
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(set(result), ACTIVE_KEYS)
        self.assertEqual(result["target_temperature"], 21.0)
        self.assertEqual(result["reason"], "schedule_occupied")
        self.assertEqual(result["active_block"]["start_time"], "07:00")

    def test_schedule_not_occupied_uses_base_temperature(self) -> None:
        store = _active_store("off")
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(set(result), ACTIVE_KEYS)
        self.assertEqual(result["target_temperature"], 18.0)
        self.assertEqual(result["reason"], "schedule")

    def test_schedule_without_occupied_temperature_uses_base(self) -> None:
        store = _store_with_occupancy("on")
        store.get_room("lounge").weekly_schedule["monday"] = [
            Block.new("07:00", "09:00", 19.5)
        ]
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(result["target_temperature"], 19.5)
        self.assertEqual(result["reason"], "schedule")

    def test_following_room_uses_house_block(self) -> None:
        store = _active_store("off")
        house_block = Block.new("07:30", "10:00", 20.0, occupied_temperature=22.0)
        store._house_schedule["monday"] = [house_block]
        room = store.get_room("lounge")
        room.follow_house_schedule = True
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(result["active_block"], house_block.to_dict())
        self.assertEqual(result["target_temperature"], 20.0)
        self.assertEqual(result["reason"], "schedule")
        store._hass.states.set(OCCUPANCY_ENTITY, "on")
        result = store.get_active_block("lounge", MONDAY_8AM)
        self.assertEqual(result["target_temperature"], 22.0)
        self.assertEqual(result["reason"], "schedule_occupied")

    def test_following_room_without_active_house_block_returns_room_fallback(self) -> None:
        store = _active_store("on")
        store._house_schedule["monday"] = [Block.new("18:00", "22:00", 20.0)]
        room = store.get_room("lounge")
        room.fallback_temp = 15.5
        room.follow_house_schedule = True
        result = store.get_active_block("lounge", MONDAY_8AM)
        # The room's own active block is ignored while following
        self.assertEqual(result, {
            "active_block": None,
            "target_temperature": 15.5,
            "reason": "fallback",
        })

    def test_fallback_keys_unchanged(self) -> None:
        store = _active_store("on")
        result = store.get_active_block("lounge", datetime(2024, 1, 1, 12, 0))
        self.assertEqual(result, {
            "active_block": None,
            "target_temperature": store._config.global_fallback_temp,
            "reason": "fallback",
        })


class GetUpcomingBlocksTests(unittest.TestCase):
    def _store(self):
        store = _store_with_room()
        room = store.get_room("lounge")
        room.weekly_schedule["monday"] = [Block.new("09:00", "10:00", 18.0)]
        store._house_schedule["monday"] = [Block.new("18:00", "22:00", 20.0)]
        return store, room

    def test_non_following_room_returns_room_blocks(self) -> None:
        store, room = self._store()
        result = store.get_upcoming_blocks("lounge", MONDAY_8AM, limit=1)
        self.assertEqual(result, [{
            "day": "monday",
            "date": "2024-01-01",
            "block": room.weekly_schedule["monday"][0].to_dict(),
            "preheat_start": "09:00",
        }])

    def test_following_room_returns_house_blocks(self) -> None:
        store, room = self._store()
        room.follow_house_schedule = True
        room.preheat_offset_minutes = 30
        result = store.get_upcoming_blocks("lounge", MONDAY_8AM, limit=1)
        # The room's own preheat offset still applies to house blocks
        self.assertEqual(result, [{
            "day": "monday",
            "date": "2024-01-01",
            "block": store._house_schedule["monday"][0].to_dict(),
            "preheat_start": "17:30",
        }])


if __name__ == "__main__":
    unittest.main()
