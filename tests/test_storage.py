"""Store tests for plan 001 (house and conditional schedules)."""
from __future__ import annotations

import unittest

import ha_stubs

MODS = ha_stubs.load_modules()
SchedulerStore = MODS["storage"].SchedulerStore
Block = MODS["models"].Block
Room = MODS["models"].Room
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


if __name__ == "__main__":
    unittest.main()
