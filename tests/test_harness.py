"""Smoke tests for the HA stub harness (plan 001, decision D1)."""
from __future__ import annotations

import sys
import unittest

import ha_stubs

MODS = ha_stubs.load_modules()


class HarnessTests(unittest.IsolatedAsyncioTestCase):
    def test_modules_load(self) -> None:
        for name in ha_stubs.MODULES:
            self.assertIn(name, MODS)
            self.assertIs(sys.modules[f"{ha_stubs.PACKAGE_NAME}.{name}"], MODS[name])
        self.assertTrue(hasattr(MODS["storage"], "SchedulerStore"))
        self.assertTrue(hasattr(MODS["scheduler"], "EnvironmentalScheduler"))

    def test_init_not_executed(self) -> None:
        self.assertNotIn("voluptuous", sys.modules)
        package = sys.modules[ha_stubs.PACKAGE_NAME]
        self.assertFalse(hasattr(package, "async_setup_entry"))

    async def test_store_loads_and_saves_empty_data(self) -> None:
        hass = ha_stubs.FakeHass()
        store = MODS["storage"].SchedulerStore(hass)
        await store.async_load()
        self.assertEqual(store.get_rooms(), [])
        await store.async_save()
        saved = store._store.data
        self.assertEqual(saved["rooms"], [])
        self.assertIn("config", saved)
        self.assertEqual(store._store.save_count, 1)


if __name__ == "__main__":
    unittest.main()
