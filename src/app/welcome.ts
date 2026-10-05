/**
 * Notes a new user starts with: a short tutorial, plus two everyday examples. Every calculation
 * line in them is checked by tests/welcome.test.ts.
 */

export const WELCOME_NOTE = `# Welcome to Reckon
// Each line is a calculation, and its answer appears on the right.
// Click an answer to copy it. Press ⌘K (Ctrl+K) for every command, or ? for shortcuts.

# 1. Just type
2 + 2
20% of 50
1.5k + 250
// Words are ignored, so notes can read naturally:
3 apples + 2 apples

# 2. Name things
rent = $1,200
utilities = $150
rent + utilities

# 3. Add things up
coffee: $4.50
lunch: $12
dinner: $28
sum

# 4. Units, money and dates
5 km in miles
$30 in EUR
72 °F in °C
today + 2 weeks
days until Dec 25
3pm PST in London

# 5. Make it yours
tip(bill, rate) = bill × rate
tip($80, 18%)
1 sprint = 2 weeks
3 sprints in days
if rent > $1,000 then 5% off rent else rent

// Edit any line and the answers update. There are two more examples in the notes list,
// and the full syntax is under "Help and docs" in the ⌘K menu.
`;

export const BUDGET_NOTE = `# Monthly budget
// An example: change the numbers to match yours.
income = $4,200

# Bills
rent: $1,450
utilities: $180
phone: $45
internet: $60
insurance: $120
bills = sum

# Everyday
groceries: $520
transport: $160
eating out: $200
fun: $150
everyday = sum

# What's left
left over = income - bills - everyday
savings rate: round(left over / income × 100) // percent
if left over > $0 then left over × 12 else $0 // saved in a year
`;

export const TRIP_NOTE = `# Weekend in Lisbon
// An example trip: euro prices convert to dollars with today's rates.
flights: $380 × 2
hotel = 3 nights × €140
food: 3 × €90
museums: 2 × €15
total = sum
total in EUR
per person = total / 2

# Getting around
castle walk: 2.4 km in miles
drive to Sintra: 28 km / (50 km/h) in min

# Timing
departure = next friday at 6pm
departure in Lisbon
days until departure
`;

/** First-run notes, oldest first: the tutorial is created last, so it's at the top and opens. */
export const FIRST_RUN_NOTES = [TRIP_NOTE, BUDGET_NOTE, WELCOME_NOTE];
