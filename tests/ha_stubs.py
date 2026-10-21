"""Minimal Home Assistant fakes for the stdlib unit tests.

Registers fake homeassistant modules in sys.modules (only the names the code
under test imports) and loads const, models, storage and scheduler from
custom_components/environmental_scheduler/ by file path. The package
__init__.py is never executed, so voluptuous and the HTTP component are not
needed.
"""
from __future__ import annotations

import copy
import importlib.util
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

# Keep the test run from writing __pycache__ into custom_components/.
sys.dont_write_bytecode = True

PACKAGE_NAME = "environmental_scheduler"
PACKAGE_DIR = (
    Path(__file__).resolve().parent.parent
    / "custom_components" / "environmental_scheduler"
)
MODULES = ("const", "models", "storage", "scheduler")


# ----------------------------------------------------------------------
# homeassistant.core
# ----------------------------------------------------------------------

class HomeAssistant:
    """Type stand-in for homeassistant.core.HomeAssistant."""


class FakeState:
    def __init__(self, entity_id: str, state: str, attributes: dict | None = None) -> None:
        self.entity_id = entity_id
        self.state = state
        self.attributes = attributes or {}


class FakeStates:
    """Controllable hass.states: set or remove a state, then get returns it."""

    def __init__(self) -> None:
        self._states: dict[str, FakeState] = {}

    def set(self, entity_id: str, state: str, attributes: dict | None = None) -> None:
        self._states[entity_id] = FakeState(entity_id, state, attributes)

    def remove(self, entity_id: str) -> None:
        self._states.pop(entity_id, None)

    def get(self, entity_id: str) -> FakeState | None:
        return self._states.get(entity_id)


class FakeBus:
    """Records hass.bus.async_fire calls as (event_type, event_data)."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict]] = []

    def async_fire(self, event_type: str, event_data: dict | None = None) -> None:
        self.events.append((event_type, event_data or {}))


class FakeServices:
    """Records hass.services.async_call calls as dicts."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def async_call(
        self, domain: str, service: str, service_data: dict | None = None,
        blocking: bool = False, **kwargs,
    ) -> None:
        self.calls.append({
            "domain": domain,
            "service": service,
            "data": service_data or {},
            "blocking": blocking,
        })


class FakeHass(HomeAssistant):
    def __init__(self) -> None:
        self.states = FakeStates()
        self.bus = FakeBus()
        self.services = FakeServices()
        # Stored data per storage key, shared by every Store on this hass.
        self.storage_data: dict[str, dict | None] = {}


# ----------------------------------------------------------------------
# homeassistant.helpers.storage
# ----------------------------------------------------------------------

class Store:
    """In-memory stand-in for homeassistant.helpers.storage.Store.

    `data` holds what was last saved (or seeded by a test); None means
    nothing stored. It lives on hass.storage_data under `key`, so every
    Store built for the same hass shares it. Copies are returned and kept
    so callers cannot mutate the stored value by reference.
    """

    def __init__(self, hass, version: int, key: str, *args, **kwargs) -> None:
        self.hass = hass
        self.version = version
        self.key = key
        self.save_count = 0
        self.remove_count = 0

    @property
    def data(self) -> dict | None:
        return self.hass.storage_data.get(self.key)

    @data.setter
    def data(self, value: dict | None) -> None:
        self.hass.storage_data[self.key] = value

    async def async_load(self):
        return copy.deepcopy(self.data)

    async def async_save(self, data) -> None:
        self.data = copy.deepcopy(data)
        self.save_count += 1

    async def async_remove(self) -> None:
        self.hass.storage_data.pop(self.key, None)
        self.remove_count += 1


# ----------------------------------------------------------------------
# homeassistant.helpers.event
# ----------------------------------------------------------------------

class TrackedInterval:
    def __init__(self, hass, action, interval) -> None:
        self.hass = hass
        self.action = action
        self.interval = interval
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True


tracked_intervals: list[TrackedInterval] = []


def async_track_time_interval(hass, action, interval, *args, **kwargs):
    """Record the registration and return a cancel callable."""
    tracked = TrackedInterval(hass, action, interval)
    tracked_intervals.append(tracked)
    return tracked.cancel


# ----------------------------------------------------------------------
# homeassistant.util.dt
# ----------------------------------------------------------------------

class _DtUtil(types.ModuleType):
    """Stand-in for homeassistant.util.dt: HA's configured time zone.

    DEFAULT_TIME_ZONE is UTC unless a test sets it. As in HA, as_local
    treats a naive datetime as already in the default zone.
    """

    DEFAULT_TIME_ZONE = timezone.utc

    def set_default_time_zone(self, time_zone) -> None:
        self.DEFAULT_TIME_ZONE = time_zone

    def as_local(self, dattim: datetime) -> datetime:
        if dattim.tzinfo is None:
            dattim = dattim.replace(tzinfo=self.DEFAULT_TIME_ZONE)
        return dattim.astimezone(self.DEFAULT_TIME_ZONE)

    def now(self) -> datetime:
        return datetime.now(self.DEFAULT_TIME_ZONE)


# ----------------------------------------------------------------------
# Registration and loading
# ----------------------------------------------------------------------

def _module(name: str, **attrs) -> types.ModuleType:
    mod = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    return mod


def install_ha_stubs() -> None:
    """Register the fake homeassistant modules in sys.modules."""
    if "homeassistant" in sys.modules:
        return
    core = _module("homeassistant.core", HomeAssistant=HomeAssistant)
    storage = _module("homeassistant.helpers.storage", Store=Store)
    event = _module(
        "homeassistant.helpers.event",
        async_track_time_interval=async_track_time_interval,
    )
    helpers = _module("homeassistant.helpers", storage=storage, event=event)
    helpers.__path__ = []
    dt = _DtUtil("homeassistant.util.dt")
    util = _module("homeassistant.util", dt=dt)
    util.__path__ = []
    root = _module("homeassistant", core=core, helpers=helpers, util=util)
    root.__path__ = []
    sys.modules["homeassistant"] = root
    sys.modules["homeassistant.core"] = core
    sys.modules["homeassistant.helpers"] = helpers
    sys.modules["homeassistant.helpers.storage"] = storage
    sys.modules["homeassistant.helpers.event"] = event
    sys.modules["homeassistant.util"] = util
    sys.modules["homeassistant.util.dt"] = dt


def load_modules() -> dict[str, types.ModuleType]:
    """Load const, models, storage and scheduler without running __init__.py.

    A synthetic package module is registered first so the relative imports
    in the loaded files resolve to the modules loaded here.
    """
    install_ha_stubs()
    if PACKAGE_NAME not in sys.modules:
        package = types.ModuleType(PACKAGE_NAME)
        package.__path__ = [str(PACKAGE_DIR)]
        package.__package__ = PACKAGE_NAME
        sys.modules[PACKAGE_NAME] = package
    package = sys.modules[PACKAGE_NAME]

    loaded: dict[str, types.ModuleType] = {}
    for name in MODULES:
        full_name = f"{PACKAGE_NAME}.{name}"
        if full_name not in sys.modules:
            spec = importlib.util.spec_from_file_location(
                full_name, PACKAGE_DIR / f"{name}.py"
            )
            mod = importlib.util.module_from_spec(spec)
            sys.modules[full_name] = mod
            spec.loader.exec_module(mod)
            setattr(package, name, mod)
        loaded[name] = sys.modules[full_name]
    return loaded
