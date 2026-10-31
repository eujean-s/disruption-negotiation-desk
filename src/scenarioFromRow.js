// Build a negotiation scenario from any flights.csv row. Plain code, deterministic.
// Real values come from the row; operational limits come from the organisers' constraints workbook;
// anything the workbook does not give is a stated assumption (returned in `interpretations`).
// `capacity` is src/data/airport_capacity.json, passed in so this also runs in plain Node (scripts/impact.js).
import { GATE_CHANGE_NOTICE_MIN, WAKE_SEPARATION_MIN, hhmm } from './checker.js'

export const FLIGHTS_HEADER = 'YEAR,MONTH,DAY,DAY_OF_WEEK,AIRLINE,FLIGHT_NUMBER,TAIL_NUMBER,ORIGIN_AIRPORT,DESTINATION_AIRPORT,SCHEDULED_DEPARTURE,DEPARTURE_TIME,DEPARTURE_DELAY,TAXI_OUT,WHEELS_OFF,SCHEDULED_TIME,ELAPSED_TIME,AIR_TIME,DISTANCE,WHEELS_ON,TAXI_IN,SCHEDULED_ARRIVAL,ARRIVAL_TIME,ARRIVAL_DELAY,DIVERTED,CANCELLED,CANCELLATION_REASON,AIR_SYSTEM_DELAY,SECURITY_DELAY,AIRLINE_DELAY,LATE_AIRCRAFT_DELAY,WEATHER_DELAY'.split(',')
const TEXT_COLS = new Set(['AIRLINE', 'TAIL_NUMBER', 'ORIGIN_AIRPORT', 'DESTINATION_AIRPORT', 'CANCELLATION_REASON'])

// Workbook fuel_and_crew sheet.
const FINAL_RESERVE_MIN = 30 // "Final fuel reserve: 30 minutes of holding fuel"
const SPARE_HOLDING_MIN = 45 // "Assumed spare fuel on arrival: 45 minutes of holding"
const CREW_MAX_DUTY_MIN = 13 * 60 // "Flight crew max duty: 13 hours from report time"
// Not in the workbook (stated assumptions).
const CREW_REPORT_BEFORE_DEP_MIN = 60
const CONNECTION_AFTER_ARRIVAL_MIN = 60
const SLOTS_OFFERED = 4

const ceil5 = (m) => Math.max(5, Math.ceil(m / 5) * 5)
const hhmmToMin = (v) => Math.floor(v / 100) * 60 + (v % 100)

// Accepts one CSV line from flights.csv, with or without the header line above it.
export function parseFlightRow(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  const line = lines[lines.length - 1]
  const cells = line.split(',').map((c) => c.trim())
  if (cells.length !== FLIGHTS_HEADER.length) throw new Error(`Expected ${FLIGHTS_HEADER.length} comma-separated columns from flights.csv, got ${cells.length}.`)
  const row = {}
  FLIGHTS_HEADER.forEach((k, i) => {
    row[k] = TEXT_COLS.has(k) ? cells[i] : cells[i] === '' ? 0 : Number(cells[i])
  })
  for (const k of ['SCHEDULED_ARRIVAL', 'SCHEDULED_TIME', 'FLIGHT_NUMBER']) {
    if (!Number.isFinite(row[k])) throw new Error(`${k} is not a number.`)
  }
  if (row.CANCELLED === 1 || row.DIVERTED === 1) throw new Error('Cancelled or diverted flights have no arrival to negotiate.')
  return row
}

export function scenarioFromRow(row, capacity) {
  const dest = row.DESTINATION_AIRPORT
  const sizeClass = capacity.airports[dest] || 'Non-hub'
  const cap = capacity.classes[sizeClass]
  const arr = hhmmToMin(row.SCHEDULED_ARRIVAL)

  // ATC: delay attributed to weather / the air system sets the first slot; busier airports offer slots more often.
  const atcDelay = row.WEATHER_DELAY + row.AIR_SYSTEM_DELAY
  const first = ceil5(atcDelay)
  const spacing = ceil5(600 / cap.max_runway_ops_per_hour)
  const slots = Array.from({ length: SLOTS_OFFERED }, (_, i) => first + i * spacing)
  const heavy = sizeClass === 'Large hub' || sizeClass === 'Medium hub'
  const heavy_arrivals = heavy ? [{ type: 'Heavy (widebody)', at_delay_min: first - 1 }] : []

  // GROUND: the spare gates free up one minimum turnaround apart, the first at arrival + ATC delay.
  const gates = Array.from({ length: cap.spare_gates_at_any_time }, (_, k) => ({
    id: `${dest}-S${k + 1}`,
    free_from_min: arr + atcDelay + k * cap.min_turnaround_min,
  }))

  const reportMin = arr - row.SCHEDULED_TIME - CREW_REPORT_BEFORE_DEP_MIN
  const trigger = row.WEATHER_DELAY > 15 ? 'WEATHER_DELAY' : row.LATE_AIRCRAFT_DELAY > 20 ? 'LATE_AIRCRAFT_DELAY' : 'OTHER'
  const flight = `${row.AIRLINE} ${row.FLIGHT_NUMBER} (${row.ORIGIN_AIRPORT} to ${dest})`

  return {
    id: 'CUSTOM',
    custom: true,
    flight,
    date: `${row.YEAR}-${String(row.MONTH).padStart(2, '0')}-${String(row.DAY).padStart(2, '0')}`,
    trigger,
    disruption: `BTS records ${row.WEATHER_DELAY} min weather, ${row.AIR_SYSTEM_DELAY} min air-system and ${row.LATE_AIRCRAFT_DELAY} min late-aircraft delay (arrival ${row.ARRIVAL_DELAY} min late). ${dest} is a ${sizeClass} (${cap.max_runway_ops_per_hour} runway ops/h).`,
    scheduled_arrival_label: hhmm(arr),
    scheduled_arrival_min: arr,
    runway_slots_delay_min: slots,
    heavy_arrivals,
    fuel_on_board_min: FINAL_RESERVE_MIN + SPARE_HOLDING_MIN,
    min_reserve_min: FINAL_RESERVE_MIN,
    next_connection: `Passenger connection departs ${hhmm(arr + row.TAXI_IN + CONNECTION_AFTER_ARRIVAL_MIN)}`,
    gates,
    crew_shift_end_min: reportMin + CREW_MAX_DUTY_MIN,
    csv_row: null,
    source: row,
    data_note: 'REAL: the pasted flights.csv row. Limits: challenge2_operational_constraints.xlsx where it gives a value, otherwise the assumptions listed here. No ground truth: the checker is the only judge.',
    interpretations: [
      `${dest} limits from the workbook's airport_capacity sheet (${sizeClass}): ${cap.max_runway_ops_per_hour} runway ops/h, ${cap.spare_gates_at_any_time} spare gates, ${cap.min_turnaround_min} min turnaround${capacity.airports[dest] ? '' : ' (airport not listed; Non-hub limits used)'}.`,
      `Runway slots: first at the BTS weather + air-system delay (${atcDelay} min, rounded up to ${first}), then every ${spacing} min (600 / ops per hour, rounded to 5). Assumption.`,
      heavy ? `One heavy arrival 1 min before the first slot (hubs see widebody traffic), so ATC must apply the ${WAKE_SEPARATION_MIN} min wake gap. Assumption.` : 'No heavy arrivals at this airport class. Assumption.',
      `Gates: spare gates free up ${cap.min_turnaround_min} min (min turnaround) apart, the first at arrival + ATC delay; a gate needs ${GATE_CHANGE_NOTICE_MIN} min change notice (workbook).`,
      `Fuel: ${SPARE_HOLDING_MIN} min spare holding over a ${FINAL_RESERVE_MIN} min final reserve (workbook fuel_and_crew).`,
      `Crew: ${CREW_MAX_DUTY_MIN / 60} h max duty from report (workbook); report assumed ${CREW_REPORT_BEFORE_DEP_MIN} min before departure, so duty ends ${hhmm(reportMin + CREW_MAX_DUTY_MIN)} local at ${dest}.`,
      `Passenger connection assumed ${CONNECTION_AFTER_ARRIVAL_MIN} min after the scheduled at-gate time (soft constraint).`,
    ],
  }
}
