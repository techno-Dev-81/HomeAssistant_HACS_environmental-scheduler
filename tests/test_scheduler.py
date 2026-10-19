"""Scheduler tests for plan 001 (house and conditional schedules)."""
from __future__ import annotations

import unittest

import ha_stubs

MODS = ha_stubs.load_modules()
EnvironmentalScheduler = MODS["scheduler"].EnvironmentalScheduler
SchedulerStore = MODS["storage"].SchedulerStore


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


if __name__ == "__main__":
    unittest.main()
