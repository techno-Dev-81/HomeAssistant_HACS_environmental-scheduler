"""Store tests for plan 001 (house and conditional schedules)."""
from __future__ import annotations

import unittest

import ha_stubs

MODS = ha_stubs.load_modules()
SchedulerStore = MODS["storage"].SchedulerStore
Block = MODS["models"].Block
Room = MODS["models"].Room
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


if __name__ == "__main__":
    unittest.main()
