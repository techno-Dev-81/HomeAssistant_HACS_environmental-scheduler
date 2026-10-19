"""Model tests for plan 001 (house and conditional schedules)."""
from __future__ import annotations

import unittest

import ha_stubs

MODS = ha_stubs.load_modules()
Block = MODS["models"].Block
ValidationError = MODS["models"].ValidationError
Room = MODS["models"].Room
SystemConfig = MODS["models"].SystemConfig


class BlockOccupiedTemperatureTests(unittest.TestCase):
    def test_default_is_none(self) -> None:
        block = Block.new("07:00", "09:00", 20.0)
        self.assertIsNone(block.occupied_temperature)

    def test_valid_value(self) -> None:
        block = Block.new("07:00", "09:00", 18.0, occupied_temperature=21.5)
        self.assertEqual(block.occupied_temperature, 21.5)
        block.validate()

    def test_range_bounds_valid(self) -> None:
        Block.new("07:00", "09:00", 20.0, occupied_temperature=5.0).validate()
        Block.new("07:00", "09:00", 20.0, occupied_temperature=35.0).validate()

    def test_out_of_range_rejected(self) -> None:
        for value in (4.5, 35.5):
            with self.subTest(value=value):
                block = Block.new("07:00", "09:00", 20.0, occupied_temperature=value)
                with self.assertRaises(ValidationError):
                    block.validate()

    def test_non_half_step_rejected(self) -> None:
        block = Block.new("07:00", "09:00", 20.0, occupied_temperature=20.3)
        with self.assertRaises(ValidationError):
            block.validate()

    def test_null_valid(self) -> None:
        Block.new("07:00", "09:00", 20.0, occupied_temperature=None).validate()

    def test_round_trip(self) -> None:
        for value in (22.5, None):
            with self.subTest(value=value):
                block = Block.new("07:00", "09:00", 20.0, occupied_temperature=value)
                data = block.to_dict()
                self.assertIn("occupied_temperature", data)
                self.assertEqual(data["occupied_temperature"], value)
                self.assertEqual(Block.from_dict(data), block)

    def test_old_dict_without_key(self) -> None:
        data = {
            "id": "block_abc12345",
            "start_time": "07:00",
            "end_time": "09:00",
            "temperature": 20.0,
            "enabled": True,
        }
        block = Block.from_dict(data)
        self.assertIsNone(block.occupied_temperature)
        self.assertEqual(block.temperature, 20.0)
        block.validate()


class RoomFollowHouseScheduleTests(unittest.TestCase):
    def test_default_is_false(self) -> None:
        room = Room(id="lounge", name="Lounge")
        self.assertFalse(room.follow_house_schedule)

    def test_round_trip(self) -> None:
        for value in (True, False):
            with self.subTest(value=value):
                room = Room(id="lounge", name="Lounge", follow_house_schedule=value)
                data = room.to_dict()
                self.assertIn("follow_house_schedule", data)
                self.assertEqual(data["follow_house_schedule"], value)
                self.assertEqual(Room.from_dict(data), room)

    def test_old_dict_without_key(self) -> None:
        room = Room.from_dict({"id": "lounge", "name": "Lounge"})
        self.assertFalse(room.follow_house_schedule)

    def test_occupancy_entity_unchanged_by_round_trip(self) -> None:
        # PB8: occupancy_entity is stored as before and not altered.
        data = {
            "id": "lounge",
            "name": "Lounge",
            "occupancy_entity": "binary_sensor.lounge_motion",
        }
        room = Room.from_dict(data)
        self.assertEqual(room.occupancy_entity, "binary_sensor.lounge_motion")
        out = room.to_dict()
        self.assertEqual(out["occupancy_entity"], "binary_sensor.lounge_motion")
        self.assertEqual(Room.from_dict(out).occupancy_entity, "binary_sensor.lounge_motion")


class SystemConfigHouseOccupancyEntityTests(unittest.TestCase):
    def test_default_is_none(self) -> None:
        self.assertIsNone(SystemConfig().house_occupancy_entity)

    def test_round_trip(self) -> None:
        for value in ("binary_sensor.house_occupied", None):
            with self.subTest(value=value):
                config = SystemConfig(house_occupancy_entity=value)
                data = config.to_dict()
                self.assertIn("house_occupancy_entity", data)
                self.assertEqual(data["house_occupancy_entity"], value)
                self.assertEqual(SystemConfig.from_dict(data), config)

    def test_old_dict_without_key(self) -> None:
        config = SystemConfig.from_dict({"house_mode": "normal"})
        self.assertIsNone(config.house_occupancy_entity)
        self.assertEqual(config.house_mode, "normal")


if __name__ == "__main__":
    unittest.main()
