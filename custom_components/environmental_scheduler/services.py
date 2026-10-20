from __future__ import annotations

import logging
from datetime import datetime

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, HOUSE_MODES
from .storage import SchedulerStore

_LOGGER = logging.getLogger(__name__)

ATTR_ROOM       = "room"
ATTR_DAY        = "day"
ATTR_MODE       = "mode"
ATTR_ENABLED    = "enabled"
ATTR_BLOCK_ID   = "block_id"
ATTR_START_TIME = "start_time"
ATTR_END_TIME   = "end_time"
ATTR_TEMPERATURE = "temperature"
ATTR_SCHEDULE   = "schedule"
ATTR_OCCUPIED_TEMPERATURE = "occupied_temperature"

SCHEDULE_TARGETS = ["room", "house"]

SERVICE_GET_ROOMS            = "get_rooms"
SERVICE_GET_ACTIVE_BLOCK     = "get_active_block"
SERVICE_GET_BLOCKS           = "get_blocks"
SERVICE_GET_UPCOMING_BLOCKS  = "get_upcoming_blocks"
SERVICE_UPDATE_ROOM          = "update_room"
SERVICE_ADD_ROOM             = "add_room"
SERVICE_DELETE_ROOM          = "delete_room"
SERVICE_SET_HOUSE_MODE       = "set_house_mode"
SERVICE_SET_VACATION_MODE    = "set_vacation_mode"
SERVICE_COMMIT_BLOCK         = "commit_block"
SERVICE_DELETE_BLOCK         = "delete_block"
SERVICE_TOGGLE_BLOCK         = "toggle_block"
SERVICE_COPY_DAY             = "copy_day"
SERVICE_GET_HOUSE_STATUS     = "get_house_status"
SERVICE_SET_PREHEAT_OFFSET   = "set_preheat_offset"

SCHEMA_GET_ACTIVE_BLOCK = vol.Schema({
    vol.Required(ATTR_ROOM): cv.string,
})

SCHEMA_GET_BLOCKS = vol.Schema({
    vol.Optional(ATTR_ROOM):     cv.string,
    vol.Optional(ATTR_SCHEDULE): vol.In(SCHEDULE_TARGETS),
    vol.Optional(ATTR_DAY): vol.In([
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
    ]),
})

SCHEMA_SET_HOUSE_MODE = vol.Schema({
    vol.Required(ATTR_MODE): vol.In(HOUSE_MODES),
})

SCHEMA_SET_VACATION_MODE = vol.Schema({
    vol.Required(ATTR_ENABLED): cv.boolean,
})

DAYS_OF_WEEK = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]

SCHEMA_COMMIT_BLOCK = vol.Schema({
    vol.Optional(ATTR_ROOM):        cv.string,
    vol.Optional(ATTR_SCHEDULE):    vol.In(SCHEDULE_TARGETS),
    vol.Required(ATTR_DAY):         vol.In(DAYS_OF_WEEK),
    vol.Required(ATTR_START_TIME):  cv.string,
    vol.Required(ATTR_END_TIME):    cv.string,
    vol.Required(ATTR_TEMPERATURE): vol.All(vol.Coerce(float), vol.Range(min=5, max=35)),
    vol.Optional(ATTR_OCCUPIED_TEMPERATURE): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(min=5, max=35))),
    vol.Optional(ATTR_BLOCK_ID):    cv.string,
    vol.Optional(ATTR_ENABLED, default=True): cv.boolean,
})

SCHEMA_DELETE_BLOCK = vol.Schema({
    vol.Optional(ATTR_ROOM):     cv.string,
    vol.Optional(ATTR_SCHEDULE): vol.In(SCHEDULE_TARGETS),
    vol.Required(ATTR_DAY):      vol.In(DAYS_OF_WEEK),
    vol.Required(ATTR_BLOCK_ID): cv.string,
})

SCHEMA_TOGGLE_BLOCK = vol.Schema({
    vol.Optional(ATTR_ROOM):     cv.string,
    vol.Optional(ATTR_SCHEDULE): vol.In(SCHEDULE_TARGETS),
    vol.Required(ATTR_DAY):      vol.In(DAYS_OF_WEEK),
    vol.Required(ATTR_BLOCK_ID): cv.string,
    vol.Required(ATTR_ENABLED):  cv.boolean,
})

SCHEMA_COPY_DAY = vol.Schema({
    vol.Optional(ATTR_ROOM):        cv.string,
    vol.Optional(ATTR_SCHEDULE):    vol.In(SCHEDULE_TARGETS),
    vol.Required("source_day"):     vol.In(DAYS_OF_WEEK),
    vol.Required("target_days"):    [vol.In(DAYS_OF_WEEK)],
})

SCHEMA_ADD_ROOM = vol.Schema({
    vol.Required("name"): cv.string,
})

SCHEMA_DELETE_ROOM = vol.Schema({
    vol.Required(ATTR_ROOM): cv.string,
})

SCHEMA_UPDATE_ROOM = vol.Schema({
    vol.Required(ATTR_ROOM):                       cv.string,
    vol.Optional("name"):                          cv.string,
    vol.Optional("area_id"):                       vol.Any(cv.string, None),
    vol.Optional("climate_entities", default=[]):  [cv.string],
    vol.Optional("hot_water_entity"):              vol.Any(cv.string, None),
    vol.Optional("temperature_sensors", default=[]): [cv.string],
    vol.Optional("door_entities", default=[]):     [cv.string],
    vol.Optional("window_entities", default=[]):   [cv.string],
    vol.Optional("persons", default=[]):           [cv.string],
})

SCHEMA_GET_UPCOMING_BLOCKS = vol.Schema({
    vol.Required(ATTR_ROOM): cv.string,
    vol.Optional("limit", default=5): vol.All(vol.Coerce(int), vol.Range(min=1, max=20)),
})

SCHEMA_SET_PREHEAT_OFFSET = vol.Schema({
    vol.Required(ATTR_ROOM): cv.string,
    vol.Required("offset_minutes"): vol.All(vol.Coerce(int), vol.Range(min=0, max=120)),
})


def _get_store(hass: HomeAssistant) -> SchedulerStore:
    entries = hass.data.get(DOMAIN, {})
    if not entries:
        raise ServiceValidationError("Environmental Scheduler is not loaded")
    return next(iter(entries.values()))


def _resolve_target(store: SchedulerStore, data: dict) -> str | None:
    """Return the block target: None for the house schedule, else an existing room id."""
    if data.get(ATTR_SCHEDULE) == "house":
        return None
    room_id = data.get(ATTR_ROOM)
    if not room_id:
        raise ServiceValidationError("'room' is required unless schedule is 'house'")
    if store.get_room(room_id) is None:
        raise ServiceValidationError(f"Room '{room_id}' not found")
    return room_id


def _target_event_data(target: str | None) -> dict:
    """block_changed keys identifying the edited schedule."""
    return {"schedule": "house" if target is None else "room", "room": target}


def register_services(hass: HomeAssistant) -> None:

    async def handle_get_rooms(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        rooms = store.get_rooms()
        return {"rooms": [r.to_dict() for r in rooms]}

    async def handle_get_active_block(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        room_id = call.data[ATTR_ROOM]
        try:
            result = store.get_active_block(room_id, datetime.now())
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e
        return result

    async def handle_get_blocks(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        target = _resolve_target(store, call.data)
        day = call.data.get(ATTR_DAY)

        try:
            if target is None:
                if day:
                    blocks = store.get_day(None, day)
                    return {"room": None, "house": True, "day": day, "blocks": [b.to_dict() for b in blocks]}
                return {
                    "room": None,
                    "house": True,
                    "schedule": {
                        d: [b.to_dict() for b in store.get_day(None, d)]
                        for d in DAYS_OF_WEEK
                    },
                }

            room = store.get_room(target)
            if call.data.get(ATTR_SCHEDULE) == "room":
                days = room.weekly_schedule
            else:
                days = store.effective_days(room)

            if day:
                blocks = days.get(day, [])
                return {
                    "room": target,
                    "day": day,
                    "blocks": [b.to_dict() for b in blocks],
                    "following_house": room.follow_house_schedule,
                }

            return {
                "room": target,
                "schedule": {
                    d: [b.to_dict() for b in days.get(d, [])]
                    for d in DAYS_OF_WEEK
                },
                "following_house": room.follow_house_schedule,
            }
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e

    async def handle_set_house_mode(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        mode = call.data[ATTR_MODE]
        previous = store.get_config().house_mode

        try:
            store.set_house_mode(mode)
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e

        await store.async_save()

        hass.bus.async_fire(f"{DOMAIN}.house_mode_changed", {
            "previous_mode": previous,
            "active_mode": mode,
            "triggered_by": "service",
        })

        return {
            "success": True,
            "previous_mode": previous,
            "active_mode": mode,
        }

    async def handle_set_vacation_mode(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        enabled = call.data[ATTR_ENABLED]
        mode = "vacation" if enabled else "normal"
        previous = store.get_config().house_mode

        store.set_house_mode(mode)
        await store.async_save()

        return {
            "success": True,
            "previous_mode": previous,
            "active_mode": mode,
            "vacation_temperature": store.get_config().vacation_temp,
        }

    async def handle_commit_block(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        from .models import Block, ValidationError
        target     = _resolve_target(store, call.data)
        day        = call.data[ATTR_DAY]
        block_id   = call.data.get(ATTR_BLOCK_ID)
        start_time = call.data[ATTR_START_TIME]
        end_time   = call.data[ATTR_END_TIME]
        temperature = call.data[ATTR_TEMPERATURE]
        occupied_temperature = call.data.get(ATTR_OCCUPIED_TEMPERATURE)
        enabled    = call.data[ATTR_ENABLED]

        if block_id:
            new_block = Block(id=block_id, start_time=start_time, end_time=end_time,
                              temperature=temperature, enabled=enabled,
                              occupied_temperature=occupied_temperature)
        else:
            new_block = Block.new(start_time, end_time, temperature, enabled,
                                  occupied_temperature=occupied_temperature)

        try:
            new_block.validate()
        except ValidationError as e:
            raise ServiceValidationError(str(e)) from e

        conflicts = store.check_overlaps(target, day, new_block)
        if conflicts:
            return {
                "status": "conflict",
                "block_id": new_block.id,
                "conflicts": [
                    {"block": c.block.to_dict(), "action": c.action}
                    for c in conflicts
                ],
            }

        try:
            store.commit_block(target, day, new_block, [])
        except (ValueError, ValidationError) as e:
            raise ServiceValidationError(str(e)) from e

        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.block_changed", {
            **_target_event_data(target), "day": day,
            "block": new_block.to_dict(),
            "action": "updated" if block_id else "created",
        })
        return {"status": "ok", "block": new_block.to_dict()}

    async def handle_commit_block_force(call: ServiceCall) -> ServiceResponse:
        """Commit a block, resolving all conflicts (user already confirmed)."""
        store = _get_store(hass)
        from .models import Block, ValidationError
        target     = _resolve_target(store, call.data)
        day        = call.data[ATTR_DAY]
        block_id   = call.data.get(ATTR_BLOCK_ID)
        start_time = call.data[ATTR_START_TIME]
        end_time   = call.data[ATTR_END_TIME]
        temperature = call.data[ATTR_TEMPERATURE]
        occupied_temperature = call.data.get(ATTR_OCCUPIED_TEMPERATURE)
        enabled    = call.data[ATTR_ENABLED]

        if block_id:
            new_block = Block(id=block_id, start_time=start_time, end_time=end_time,
                              temperature=temperature, enabled=enabled,
                              occupied_temperature=occupied_temperature)
        else:
            new_block = Block.new(start_time, end_time, temperature, enabled,
                                  occupied_temperature=occupied_temperature)

        conflicts = store.check_overlaps(target, day, new_block)
        try:
            store.commit_block(target, day, new_block, conflicts)
        except (ValueError, ValidationError) as e:
            raise ServiceValidationError(str(e)) from e

        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.block_changed", {
            **_target_event_data(target), "day": day,
            "block": new_block.to_dict(),
            "action": "updated" if block_id else "created",
        })
        return {"status": "ok", "block": new_block.to_dict()}

    async def handle_delete_block(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        target   = _resolve_target(store, call.data)
        day      = call.data[ATTR_DAY]
        block_id = call.data[ATTR_BLOCK_ID]
        try:
            store.delete_block(target, day, block_id)
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e
        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.block_changed", {
            **_target_event_data(target), "day": day,
            "block": {"id": block_id},
            "action": "deleted",
        })
        return {"status": "ok"}

    async def handle_toggle_block(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        target   = _resolve_target(store, call.data)
        day      = call.data[ATTR_DAY]
        block_id = call.data[ATTR_BLOCK_ID]
        enabled  = call.data[ATTR_ENABLED]
        block = next((b for b in store.get_day(target, day) if b.id == block_id), None)
        if not block:
            raise ServiceValidationError(f"Block '{block_id}' not found")
        block.enabled = enabled
        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.block_changed", {
            **_target_event_data(target), "day": day,
            "block": block.to_dict(),
            "action": "enabled" if enabled else "disabled",
        })
        return {"status": "ok", "block": block.to_dict()}

    hass.services.async_register(
        DOMAIN, SERVICE_GET_ROOMS,
        handle_get_rooms,
        schema=vol.Schema({}),
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GET_ACTIVE_BLOCK,
        handle_get_active_block,
        schema=SCHEMA_GET_ACTIVE_BLOCK,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GET_BLOCKS,
        handle_get_blocks,
        schema=SCHEMA_GET_BLOCKS,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_HOUSE_MODE,
        handle_set_house_mode,
        schema=SCHEMA_SET_HOUSE_MODE,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_VACATION_MODE,
        handle_set_vacation_mode,
        schema=SCHEMA_SET_VACATION_MODE,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_COMMIT_BLOCK,
        handle_commit_block,
        schema=SCHEMA_COMMIT_BLOCK,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, f"{SERVICE_COMMIT_BLOCK}_force",
        handle_commit_block_force,
        schema=SCHEMA_COMMIT_BLOCK,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_BLOCK,
        handle_delete_block,
        schema=SCHEMA_DELETE_BLOCK,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_TOGGLE_BLOCK,
        handle_toggle_block,
        schema=SCHEMA_TOGGLE_BLOCK,
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_copy_day(call: ServiceCall) -> ServiceResponse:
        from .models import Block
        store      = _get_store(hass)
        target     = _resolve_target(store, call.data)
        source_day = call.data["source_day"]
        target_days = call.data["target_days"]

        source_blocks = store.get_day(target, source_day)
        copied = 0
        for day in target_days:
            if day == source_day:
                continue
            new_blocks = [Block.new(b.start_time, b.end_time, b.temperature, b.enabled,
                                    occupied_temperature=b.occupied_temperature)
                          for b in source_blocks]
            store.set_day(target, day, new_blocks)
            copied += 1
            hass.bus.async_fire(f"{DOMAIN}.block_changed", {
                **_target_event_data(target), "day": day,
                "action": "day_copied", "source_day": source_day,
            })

        await store.async_save()
        return {"status": "ok", "source_day": source_day, "copied_to": [d for d in target_days if d != source_day], "block_count": len(source_blocks)}

    hass.services.async_register(
        DOMAIN, SERVICE_COPY_DAY,
        handle_copy_day,
        schema=SCHEMA_COPY_DAY,
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_get_house_status(call: ServiceCall) -> ServiceResponse:
        store   = _get_store(hass)
        config  = store.get_config()
        now     = datetime.now()
        rooms   = store.get_rooms()

        room_statuses = []
        for room in rooms:
            try:
                status = store.get_active_block(room.id, now)
            except ValueError:
                status = {"active_block": None, "target_temperature": None, "reason": "error"}
            room_statuses.append({
                "id":   room.id,
                "name": room.name,
                "target_temperature": status["target_temperature"],
                "reason": status["reason"],
                "active_block": status["active_block"],
                "persons": room.persons,
            })

        person_states = []
        for person in config.persons:
            state = hass.states.get(person.ha_entity)
            person_states.append({
                "id":        person.id,
                "name":      person.name,
                "ha_entity": person.ha_entity,
                "state":     state.state if state else "unknown",
            })

        return {
            "house_mode": config.house_mode,
            "vacation_temp": config.vacation_temp,
            "global_away_temp": config.global_away_temp,
            "persons": person_states,
            "rooms": room_statuses,
        }

    hass.services.async_register(
        DOMAIN, SERVICE_GET_HOUSE_STATUS,
        handle_get_house_status,
        schema=vol.Schema({}),
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_add_room(call: ServiceCall) -> ServiceResponse:
        import re
        store = _get_store(hass)
        name = call.data["name"].strip()
        if not name:
            raise ServiceValidationError("Room name cannot be empty")
        room_id = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        existing = {r.id for r in store.get_rooms()}
        base, n = room_id, 1
        while room_id in existing:
            room_id = f"{base}_{n}"; n += 1
        from .models import Room
        room = Room(id=room_id, name=name)
        store.add_room(room)
        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.room_changed", {"room": room_id, "action": "created"})
        return {"status": "ok", "room": room.to_dict()}

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_ROOM,
        handle_add_room,
        schema=SCHEMA_ADD_ROOM,
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_delete_room(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        room_id = call.data[ATTR_ROOM]
        try:
            store.delete_room(room_id)
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e
        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.room_changed", {"room": room_id, "action": "deleted"})
        return {"status": "ok"}

    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_ROOM,
        handle_delete_room,
        schema=SCHEMA_DELETE_ROOM,
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_update_room(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        room_id = call.data[ATTR_ROOM]
        room = store.get_room(room_id)
        if not room:
            raise ServiceValidationError(f"Room '{room_id}' not found")
        if "name" in call.data:
            room.name = call.data["name"].strip() or room.name
        if "area_id" in call.data:
            room.area_id = call.data["area_id"] or None
        room.climate_entities    = call.data.get("climate_entities", room.climate_entities)
        if "hot_water_entity" in call.data:
            room.hot_water_entity = call.data["hot_water_entity"] or None
        room.temperature_sensors = call.data.get("temperature_sensors", room.temperature_sensors)
        room.door_entities       = call.data.get("door_entities", room.door_entities)
        room.window_entities     = call.data.get("window_entities", room.window_entities)
        room.persons             = call.data.get("persons", room.persons)
        store.update_room(room)
        await store.async_save()
        hass.bus.async_fire(f"{DOMAIN}.room_changed", {"room": room.id, "action": "updated"})
        return {"status": "ok", "room": room.to_dict()}

    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_ROOM,
        handle_update_room,
        schema=SCHEMA_UPDATE_ROOM,
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_get_upcoming_blocks(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        room_id = call.data[ATTR_ROOM]
        limit = call.data.get("limit", 5)
        if store.get_room(room_id) is None:
            raise ServiceValidationError(f"Room '{room_id}' not found")
        room = store.get_room(room_id)
        try:
            upcoming = store.get_upcoming_blocks(room_id, datetime.now(), limit)
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e
        return {
            "room": room_id,
            "entity_type": room.entity_type,
            "preheat_offset_minutes": room.preheat_offset_minutes,
            "upcoming": upcoming,
            "following_house": room.follow_house_schedule,
        }

    hass.services.async_register(
        DOMAIN, SERVICE_GET_UPCOMING_BLOCKS,
        handle_get_upcoming_blocks,
        schema=SCHEMA_GET_UPCOMING_BLOCKS,
        supports_response=SupportsResponse.ONLY,
    )

    async def handle_set_preheat_offset(call: ServiceCall) -> ServiceResponse:
        store = _get_store(hass)
        room_id = call.data[ATTR_ROOM]
        offset = call.data["offset_minutes"]
        try:
            store.set_preheat_offset(room_id, offset)
        except ValueError as e:
            raise ServiceValidationError(str(e)) from e
        await store.async_save()
        return {"status": "ok", "room": room_id, "offset_minutes": offset}

    hass.services.async_register(
        DOMAIN, SERVICE_SET_PREHEAT_OFFSET,
        handle_set_preheat_offset,
        schema=SCHEMA_SET_PREHEAT_OFFSET,
        supports_response=SupportsResponse.ONLY,
    )


def unregister_services(hass: HomeAssistant) -> None:
    for service in (
        SERVICE_GET_ROOMS,
        SERVICE_GET_ACTIVE_BLOCK,
        SERVICE_GET_BLOCKS,
        SERVICE_GET_UPCOMING_BLOCKS,
        SERVICE_SET_HOUSE_MODE,
        SERVICE_SET_VACATION_MODE,
        SERVICE_COMMIT_BLOCK,
        f"{SERVICE_COMMIT_BLOCK}_force",
        SERVICE_DELETE_BLOCK,
        SERVICE_TOGGLE_BLOCK,
        SERVICE_COPY_DAY,
        SERVICE_GET_HOUSE_STATUS,
        SERVICE_SET_PREHEAT_OFFSET,
        SERVICE_UPDATE_ROOM,
        SERVICE_ADD_ROOM,
        SERVICE_DELETE_ROOM,
    ):
        hass.services.async_remove(DOMAIN, service)
