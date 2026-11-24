"""
Scaffolds MDC_Campus_Courier.alp (v2) - Option 2: the MDC North Campus mail service with
autonomous courier robots. AnyLogic 8.9, multi-method:
  DES  - mailroom flowchart (Process Modeling Library): mailArrivals -> mailSorting (3 clerks) -> sortedMail
  ABM  - Rover agents (statechart) and Walker agents (students on the walkways)
  RL   - Q-learning dispatcher inside the model (dispatchPolicy = 2); PPO hook for Jordan (policy 3)

    python build_campus_courier.py

Run ONCE to scaffold. Afterwards change the model with the AnyLogic CLI (cli-anything-anylogic)
or in the AnyLogic IDE - re-running this script overwrites the .alp.

Real data used (see README): mailroom = Duplicating & Mail Center, Room 3103 (Building 3);
offices per building from the MDC North campus directory; USPS around 10 AM; 3 mailroom staff;
late drops after 4 PM go to the next day; lockers at each building. Everything marked
ASSUMPTION / SYNTHETIC is a placeholder for real data.
"""
import os
import re

import alp_xml as A
from alp_xml import cd, nid, argb, parameter, variable, function, cyclic_event, state, branch, \
    transition, entry_point, time_plot, agent_class, fighter_instance, assemble
from alp_draw import text, rect, oval, line

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PEDESTRIANS_JS = os.path.join(REPO, "digital_twin_app", "public", "pedestrians.js")
PML_TEMPLATES = os.path.join(HERE, "pml_templates.xml")
OUT = os.path.join(HERE, "MDC_Campus_Courier.alp")
PKG = A.PKG  # "mdc_campus_courier"
DAY = 86400

# Building names. Purposes from the MDC North directory (Ricardo: A = Science, J = Justice).
BUILDING_LABEL = {
    "b1": "Bldg 1 - Administration", "b2": "Bldg 2 - Library", "b3": "Bldg 3 - MAILROOM",
    "b4": "Bldg 4 - Student Life", "b5": "Bldg 5 - Arts", "b6": "Bldg 6 - ACCESS",
    "b7": "Bldg 7 - English / Math", "b8": "Bldg 8", "b9": "Bldg 9",
    "ba": "Bldg A - Science", "bj": "Bldg J - Justice",
}
# Offices per building, MDC North campus directory (first digit of the room number)
OFFICE_SPEC = "b1:25,b2:9,b3:2,b4:4,b5:1,b6:1,b7:3,ba:2,bj:1,b8:0,b9:0"
# Building J is not in the 3D twin's walkway graph yet: approximate entrance north-west of
# Building 8 (Ricardo's screenshot), linked to the Lake Rd North crosswalk and the West Walkway Hub.
EXTRA_NODES = [("bj", "Building J Entrance (Justice)", -3.05, -2.55, ["lake_rd_north", "w_lake_junction"])]


# ---------------------------------------------------------------- campus graph from the 3D twin
def read_campus_graph():
    src = open(PEDESTRIANS_JS, encoding="utf-8").read()
    pat = re.compile(r"'(\w+)':\s*\{\s*id:\s*'\w+',\s*name:\s*'([^']+)',\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+),"
                     r"\s*neighbors:\s*\[([^\]]*)\]")
    nodes = [(k, n, float(x), float(z), re.findall(r"'(\w+)'", nb)) for k, n, x, z, nb in pat.findall(src)]
    assert len(nodes) >= 20, f"walkway graph not found in {PEDESTRIANS_JS}"
    nodes += [(k, n, x, z, list(nb)) for k, n, x, z, nb in EXTRA_NODES]
    idx = {k: i for i, (k, *_r) in enumerate(nodes)}
    edges = set()
    for k, _n, _x, _z, nbs in nodes:
        for m in nbs:
            if m in idx:
                edges.add(tuple(sorted((idx[k], idx[m]))))
    return nodes, sorted(edges)


NODES, EDGES = read_campus_graph()
KEYS = [n[0] for n in NODES]
BUILDINGS = [k for k in KEYS if k in BUILDING_LABEL]


def jstr(values):
    return "{" + ", ".join('"' + v.replace('"', "'") + '"' for v in values) + "}"


def jnum(values):
    return "{" + ", ".join(f"{v:.2f}" for v in values) + "}"


# ---------------------------------------------------------------- canvas (twin units -> pixels)
PXU = 110
OX = 40 + 4.6 * PXU
OY = 140 + 2.8 * PXU
MAX_ROVERS_DRAWN = 12
MAX_WALKERS_DRAWN = 80


def px(x):
    return round(OX + x * PXU, 1)


def py(z):
    return round(OY + z * PXU, 1)


# ======================================================================== ROVER AGENT
ROVER_CODE = r"""// ---------------------------------------------------------------------------
// Courier robot. Logic in these methods; the statechart mirrors 'phase'.
// Main calls step(dt) every stepSec seconds. Trips always start and end at the mailroom.
// ---------------------------------------------------------------------------
public java.util.ArrayList<Main.MailItem> cargo = new java.util.ArrayList<Main.MailItem>();
public java.util.ArrayList<Integer> stops = new java.util.ArrayList<Integer>();
public java.util.ArrayList<Integer> path = new java.util.ArrayList<Integer>();
public int pathIdx = 0;
public int edgeFrom = -1, edgeTo = -1;       // walkway segment the robot is on (for crowding)
public double waitUntil = 0;

public void setPhase(String p) {
    phase = p;
    nextState = p;
    statechart.receiveMessage("go");
}
public boolean isFree() { return phase.equals("Idle"); }
public boolean isTraveling() { return phase.equals("InTransit") || phase.equals("Returning"); }
public double cargoUnits() { double u = 0; for (Main.MailItem m : cargo) u += m.units; return u; }
// slots on board: 1 per package + 1 per started bundle of letters for each building
public int cargoSlots() {
    int slots = 0;
    java.util.HashMap<Integer, Integer> flats = new java.util.HashMap<Integer, Integer>();
    for (Main.MailItem m : cargo) {
        if (m.type <= 1) flats.merge(m.dest, 1, Integer::sum);
        else slots++;
    }
    for (int n : flats.values()) slots += (n + main.lettersPerSlot - 1) / main.lettersPerSlot;
    return slots;
}

// Main hands over sorted mail at the mailroom
public void startTrip(java.util.ArrayList<Main.MailItem> load) {
    cargo.clear();
    cargo.addAll(load);
    for (Main.MailItem m : load) { m.status = 3; m.loadedAt = time(); }
    trips++;
    waitUntil = time() + main.loadSecondsBase + main.loadSecondsPerItem * load.size();
    setPhase("Loading");
}

void finishLoading() { planStops(); nextStop(); }

// nearest-neighbour order of the buildings on board
void planStops() {
    stops.clear();
    java.util.ArrayList<Integer> left = new java.util.ArrayList<Integer>();
    for (Main.MailItem m : cargo) if (!left.contains(m.dest)) left.add(m.dest);
    int at = curNode;
    while (!left.isEmpty()) {
        int best = 0;
        for (int i = 1; i < left.size(); i++)
            if (main.spDist[at][left.get(i)] < main.spDist[at][left.get(best)]) best = i;
        at = left.remove(best);
        stops.add(at);
    }
}

void nextStop() {
    if (stops.isEmpty()) {
        if (curNode == main.depotNode) finishTrip();
        else { goTo(main.depotNode); setPhase("Returning"); }
    } else {
        goTo(stops.get(0));
        setPhase("InTransit");
    }
}

// at a building: put the mail in that building's locker
void startHandoff() {
    int node = stops.get(0), n = 0;
    for (Main.MailItem m : cargo) if (m.dest == node) n++;
    waitUntil = time() + main.lockerSecondsBase + main.lockerSecondsPerItem * n;
    setPhase("Handoff");
}

void endHandoff() {
    int node = stops.remove(0);
    java.util.ArrayList<Main.MailItem> done = new java.util.ArrayList<Main.MailItem>();
    for (Main.MailItem m : cargo) {
        if (m.dest != node) continue;
        if (main.lockerUsed[node] + m.units <= main.lockerCapacity(node)) {
            main.lockerUsed[node] += m.units;
            main.placeInLocker(m);
            done.add(m);
            deliveries++;
        }
    }
    if (done.size() < countFor(node)) main.lockerFullEvents++;   // locker full: rest rides back
    cargo.removeAll(done);
    nextStop();
}

int countFor(int node) { int c = 0; for (Main.MailItem m : cargo) if (m.dest == node) c++; return c; }

void finishTrip() {
    for (Main.MailItem m : cargo) main.returnToOutbox(m);
    cargo.clear();
    if (battery <= main.chargingThresholdPct + 10) main.requestCharge(this);
    else setPhase("Idle");
}

public void goTo(int node) {
    path = main.pathNodes(curNode, node);
    pathIdx = 0;
}

void arrive() {
    edgeFrom = -1; edgeTo = -1;
    if (phase.equals("InTransit")) startHandoff();
    else if (phase.equals("Returning")) finishTrip();
}

void useEnergy(double meters) {
    double e = meters / 1000.0 * main.batteryUsePctPerKm * (1 + 0.05 * cargoUnits());
    battery = Math.max(0, battery - e);
    energyUsedPct += e;
    distanceM += meters;
    main.dayEnergyPct += e;
    main.dayDistanceM += meters;
}

void move(double dt) {
    double budget = main.roverSpeedMps * dt;
    while (budget > 1e-9 && pathIdx < path.size()) {
        int target = path.get(pathIdx);
        edgeFrom = curNode; edgeTo = target;
        // slower when students crowd this walkway segment
        double f = main.crowdSpeedFactor(curNode, target);
        double dx = main.nodeX[target] - posX, dy = main.nodeY[target] - posY;
        double d = Math.hypot(dx, dy);
        if (d > 1e-6) headingRad = Math.atan2(dx, dy);       // 3D twin: heading 0 faces +z
        double reach = budget * f;
        if (d <= reach) {
            posX = main.nodeX[target]; posY = main.nodeY[target];
            curNode = target; pathIdx++; budget -= d / f; useEnergy(d);
        } else {
            posX += dx / d * reach; posY += dy / d * reach; useEnergy(reach); budget = 0;
        }
        speedNow = main.roverSpeedMps * f;
    }
    if (pathIdx >= path.size()) arrive();
}

public void step(double dt) {
    speedNow = 0;
    if (!phase.equals("Idle") && !phase.equals("WaitingCharger") && !phase.equals("Charging")) busySeconds += dt;
    if (phase.equals("Loading")) { if (time() >= waitUntil) finishLoading(); }
    else if (phase.equals("Handoff")) { if (time() >= waitUntil) endHandoff(); }
    else if (phase.equals("Charging")) {
        battery = Math.min(100, battery + main.chargeRatePctPerMin * dt / 60.0);
        if (battery >= main.chargeTargetPct) main.finishCharging(this);
    }
    else if (isTraveling()) move(dt);
}
"""

ROVER_STATES = [
    ("Idle", argb(200, 200, 200)), ("Loading", argb(255, 214, 102)), ("InTransit", argb(80, 200, 120)),
    ("Handoff", argb(255, 170, 60)), ("Returning", argb(150, 130, 230)),
    ("WaitingCharger", argb(240, 120, 120)), ("Charging", argb(230, 80, 80)),
]


def rover_statechart():
    b = nid()
    sids = {name: nid() for name, _ in ROVER_STATES}
    xml = branch(b, "decide", 460, 110)
    for i, (name, color) in enumerate(ROVER_STATES):
        col, row = i % 4, i // 4
        x, y = 60 + col * 220, 230 + row * 120
        xml += state(sids[name], name, x, y, 150, 40, color)
        xml += transition(f"go_from{name}", sids[name], b, x + 75, y,
                          [(0, 0), (0, -30), (460 - x - 75, -30), (460 - x - 75, 110 - y)], "message",
                          lx=5, ly=-40)
        default = name == "Idle"
        xml += transition(f"to{name}", b, sids[name], 460, 110,
                          [(0, 0), (x + 40 - 460, 0), (x + 40 - 460, y - 110)], "timeout",
                          condition="true" if default else f'nextState.equals("{name}")',
                          default=default, lx=5, ly=-15)
    xml += entry_point("statechart", sids["Idle"], 20, 250, [(0, 0), (40, 0)])
    return xml


rover_vars = "".join(variable(n, t, v, 1000, 40 + 20 * i) for i, (n, t, v) in enumerate([
    ("roverName", "String", '"AMR-01"'), ("phase", "String", '"Idle"'), ("nextState", "String", '"Idle"'),
    ("curNode", "int", "0"), ("posX", "double", "0"), ("posY", "double", "0"), ("headingRad", "double", "0"),
    ("speedNow", "double", "0"), ("battery", "double", "100"), ("trips", "int", "0"), ("deliveries", "int", "0"),
    ("busySeconds", "double", "0"), ("distanceM", "double", "0"), ("energyUsedPct", "double", "0"),
]))
rover_xml, ROVER_GP = agent_class(
    "Rover", extra_code=ROVER_CODE, variables=rover_vars, statechart=rover_statechart(), container_main=True,
    presentation=text(40, 40, "Courier robot: logic in Additional class code; the statechart shows its phase.", size=12))

# ======================================================================== WALKER AGENT (students)
WALKER_CODE = r"""// A student walking between buildings on the campus walkways. Main activates walkers
// (more at every class change); robots slow down on walkway segments that walkers crowd.
public java.util.ArrayList<Integer> path = new java.util.ArrayList<Integer>();
public int pathIdx = 0;
public int edgeFrom = -1, edgeTo = -1;

public void startWalk(int from, int to) {
    curNode = from;
    posX = main.nodeX[from]; posY = main.nodeY[from];
    path = main.pathNodes(from, to);
    pathIdx = 0;
    active = true;
}

public void step(double dt) {
    if (!active) return;
    double budget = walkSpeedMps * dt;
    while (budget > 1e-9 && pathIdx < path.size()) {
        int target = path.get(pathIdx);
        edgeFrom = curNode; edgeTo = target;
        double dx = main.nodeX[target] - posX, dy = main.nodeY[target] - posY;
        double d = Math.hypot(dx, dy);
        if (d <= budget) { posX = main.nodeX[target]; posY = main.nodeY[target]; curNode = target; pathIdx++; budget -= d; }
        else { posX += dx / d * budget; posY += dy / d * budget; budget = 0; }
    }
    if (pathIdx >= path.size()) { active = false; edgeFrom = -1; edgeTo = -1; }   // reached class
}
"""
walker_vars = "".join(variable(n, t, v, 600, 40 + 20 * i) for i, (n, t, v) in enumerate([
    ("active", "boolean", "false"), ("curNode", "int", "0"), ("posX", "double", "0"), ("posY", "double", "0"),
    ("walkSpeedMps", "double", "uniform(1.1, 1.5)"),
]))
walker_xml, WALKER_GP = agent_class(
    "Walker", extra_code=WALKER_CODE, variables=walker_vars, container_main=True,
    presentation=text(40, 40, "Student walking between buildings (crowds the walkways at class change).", size=12))

# ======================================================================== MAIN
MAIN_CODE = r"""// ===========================================================================
// One piece of mail (letter, newspaper, package...) from a vendor drop to an office locker
// ===========================================================================
public static class MailItem {
    public int id, type, vendor, dest, attempts = 0, arrivalDay;
    public double units, droppedAt, sortStart = -1, sortedAt = -1, loadedAt = -1, lockerAt = -1, collectedAt = -1, collectAt = -1;
    public boolean lateDrop = false;
    public int status = 0;   // 0 waiting for sorting, 1 sorting, 2 sorted (outbox), 3 on a robot, 4 in locker, 5 collected
}
public static final String[] TYPE_NAME = {"Letter", "Newspaper", "Small package", "Medium package", "Large package"};
// Space: every package takes 1 slot of a robot (or locker); letters and newspapers travel in
// bundles - up to lettersPerSlot of them share 1 slot (Ricardo).
public static final String[] VENDOR_NAME = {"USPS", "Amazon", "UPS", "FedEx", "Newspapers", "Other vendors"};

// one vendor delivery to the mailroom
public static class Drop {
    public int vendor; public double arriveAt, dueAt; public boolean late, counted;
    public java.util.ArrayList<MailItem> items = new java.util.ArrayList<MailItem>();
}

// ===========================================================================
// MDC North Campus walkway graph - same nodes / coordinates as the 3D twin
// (digital_twin_app/public/pedestrians.js) + Building J. Twin units; x right, z down.
// ===========================================================================
public final String[] nodeKey = @KEYS@;
public final String[] nodeName = @NAMES@;
public final double[] nodeTx = @TX@;
public final double[] nodeTz = @TZ@;
public final int[][] edgeList = @EDGES@;
public final String[] buildingKeys = @BKEYS@;
public final String[] buildingLabel = @BLABELS@;

public double[] nodeX, nodeY;                 // meters
public double[][] spDist; public int[][] spNext;
public int[] buildingNodes;
public int[] offices;                         // offices per node (from officeSpec)
public double[] lockerUsed;                   // locker space in use (bin units) per node
public int[][] crowd;                         // walkers on each walkway segment right now
public java.util.ArrayList<java.util.ArrayList<MailItem>> outbox = new java.util.ArrayList<java.util.ArrayList<MailItem>>();
public java.util.ArrayList<Drop> drops = new java.util.ArrayList<Drop>();
public java.util.LinkedList<MailItem> injectQueue = new java.util.LinkedList<MailItem>();
public java.util.HashMap<Agent, MailItem> itemOf = new java.util.HashMap<Agent, MailItem>();
public java.util.ArrayList<MailItem> inLockers = new java.util.ArrayList<MailItem>();
public java.util.ArrayList<Rover> chargeQueue = new java.util.ArrayList<Rover>();
public int itemCounter = 0;

public int indexOfNode(String key) { for (int i = 0; i < nodeKey.length; i++) if (nodeKey[i].equals(key)) return i; return -1; }

public void buildGraph() {
    int n = nodeKey.length;
    nodeX = new double[n]; nodeY = new double[n];
    for (int i = 0; i < n; i++) { nodeX[i] = nodeTx[i] * metersPerTwinUnit; nodeY[i] = nodeTz[i] * metersPerTwinUnit; }
    spDist = new double[n][n]; spNext = new int[n][n];
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { spDist[i][j] = i == j ? 0 : Double.POSITIVE_INFINITY; spNext[i][j] = i == j ? i : -1; }
    for (int[] e : edgeList) {
        double d = Math.hypot(nodeX[e[0]] - nodeX[e[1]], nodeY[e[0]] - nodeY[e[1]]);
        spDist[e[0]][e[1]] = d; spDist[e[1]][e[0]] = d; spNext[e[0]][e[1]] = e[1]; spNext[e[1]][e[0]] = e[0];
    }
    for (int k = 0; k < n; k++) for (int i = 0; i < n; i++) for (int j = 0; j < n; j++)
        if (spDist[i][k] + spDist[k][j] < spDist[i][j]) { spDist[i][j] = spDist[i][k] + spDist[k][j]; spNext[i][j] = spNext[i][k]; }
    buildingNodes = new int[buildingKeys.length];
    for (int b = 0; b < buildingKeys.length; b++) buildingNodes[b] = indexOfNode(buildingKeys[b]);
    offices = new int[n]; lockerUsed = new double[n]; crowd = new int[n][n];
    for (String part : officeSpec.split(",")) {
        String[] kv = part.trim().split(":");
        int i = kv.length == 2 ? indexOfNode(kv[0].trim()) : -1;
        if (i >= 0) offices[i] = Integer.parseInt(kv[1].trim());
    }
    outbox.clear();
    for (int i = 0; i < n; i++) outbox.add(new java.util.ArrayList<MailItem>());
}

public java.util.ArrayList<Integer> pathNodes(int a, int b) {
    java.util.ArrayList<Integer> p = new java.util.ArrayList<Integer>();
    if (a == b) return p;
    if (spNext[a][b] < 0) { p.add(b); return p; }
    int c = a;
    while (c != b) { c = spNext[c][b]; p.add(c); }
    return p;
}

// ---- calendar: model time 0 = Day 1, 07:00; one model time unit = 1 second
public double absHour() { return startHour + time() / 3600.0; }
public int dayNumber() { return (int) Math.floor(absHour() / 24.0) + 1; }
public double hourOfDay() { return absHour() % 24.0; }
public double timeAtHour(int day, double hour) { return ((day - 1) * 24.0 + hour - startHour) * 3600.0; }
public boolean robotsOnDuty() { return hourOfDay() >= mailroomOpenHour && hourOfDay() < robotEndHour; }
public String clockText() {
    int m = (int) Math.floor(hourOfDay() * 60);
    return "Day " + dayNumber() + "  " + String.format("%02d:%02d", m / 60, m % 60);
}
public boolean classChangeNow() {
    double h = hourOfDay(), minute = (h * 60) % 60;
    return h >= 8 && h < 21 && minute >= 60 - classChangeMinutes;
}

// ---- crowding: robots slow down on walkway segments with students
public double crowdSpeedFactor(int a, int b) {
    int c = crowd[a][b] + crowd[b][a];
    return Math.max(minCrowdSpeedFactor, 1.0 / (1.0 + crowdImpactPerWalker * c));
}

// ---- lockers
public double lockerCapacity(int node) { return lockerBaseSlots + lockerSlotsPerOffice * offices[node]; }

public int pickDestination() {
    int total = 0;
    for (int b : buildingNodes) total += offices[b];
    int r = uniform_discr(1, Math.max(1, total));
    for (int b : buildingNodes) { r -= offices[b]; if (r <= 0) return b; }
    return buildingNodes[0];
}

// ---- KPIs
public int sortedWaiting() { int s = 0; for (java.util.ArrayList<MailItem> q : outbox) s += q.size(); return s; }
public double sortedWaitingUnits() { double s = 0; for (java.util.ArrayList<MailItem> q : outbox) for (MailItem m : q) s += m.units; return s; }
public int inMailroom() { return notYetSorting + inSorting + sortedWaiting(); }
public int busyRovers() { int s = 0; for (Rover r : rovers) if (!r.isFree()) s++; return s; }
public int freeRovers() { int s = 0; for (Rover r : rovers) if (r.isFree() && r.battery > chargingThresholdPct) s++; return s; }
public double avgBattery() { double s = 0; for (Rover r : rovers) s += r.battery; return rovers.size() == 0 ? 0 : s / rovers.size(); }
public int activeWalkers() { int s = 0; for (Walker w : walkers) if (w.active) s++; return s; }
public double sameDayPctToday() { return dayEligible == 0 ? 100 : 100.0 * daySameDay / dayEligible; }
public double sameDayPctAll() { return totalEligible == 0 ? 100 : 100.0 * totalSameDay / totalEligible; }
public double avgHoursToLocker() { return totalDelivered == 0 ? 0 : totalHoursToLocker / totalDelivered; }
public String f1(double v) { return String.format(java.util.Locale.US, "%.1f", v); }

// ---- drawing helpers (twin units -> canvas pixels)
public double roverPx(int i) { return i < rovers.size() ? @OX@ + rovers.get(i).posX / metersPerTwinUnit * @PXU@ : -500; }
public double roverPy(int i) { return i < rovers.size() ? @OY@ + rovers.get(i).posY / metersPerTwinUnit * @PXU@ : -500; }
public String roverLabel(int i) { return i < rovers.size() ? rovers.get(i).roverName.substring(4) : ""; }
public Color roverColor(int i) {
    if (i >= rovers.size()) return new Color(0, 0, 0, 0);
    String p = rovers.get(i).phase;
    if (p.equals("InTransit")) return new Color(40, 170, 90);
    if (p.equals("Loading") || p.equals("Handoff")) return new Color(255, 160, 30);
    if (p.equals("Returning")) return new Color(140, 110, 220);
    if (p.equals("Charging") || p.equals("WaitingCharger")) return new Color(220, 50, 50);
    return new Color(150, 150, 150);
}
public double walkerPx(int i) { return i < walkers.size() && walkers.get(i).active ? @OX@ + walkers.get(i).posX / metersPerTwinUnit * @PXU@ : -500; }
public double walkerPy(int i) { return i < walkers.size() && walkers.get(i).active ? @OY@ + walkers.get(i).posY / metersPerTwinUnit * @PXU@ : -500; }
public String buildingText(int node) {
    if (node == depotNode) return "outbox: " + sortedWaiting() + " items";
    return offices[node] + " offices  locker " + (int) Math.round(100 * lockerUsed[node] / Math.max(0.01, lockerCapacity(node))) + "%";
}

// ===========================================================================
// Q-learning dispatcher (dispatchPolicy = 2). One episode = one working day.
// state  = items ready (4) x free robots (3) x avg battery (3) x time block (4) x class change soon (2)
// action = 0 wait, 1 send one robot, 2 send every free robot, 3 send the lowest free robot to charge
// reward = delivered units - waiting penalty - energy penalty (per decision interval)
// ===========================================================================
public static final int Q_STATES = 4 * 3 * 3 * 4 * 2, Q_ACTIONS = 4;
public double[][] qTable = new double[Q_STATES][Q_ACTIONS];
public int qPrevState = -1, qPrevAction = -1;
public double qEpsilon = -1, qDayReward = 0;
public double qDeliveredUnitsSince = 0, qEnergyAtLast = 0;

public int qState() {
    double u = sortedWaitingUnits();
    int ready = u <= 0.01 ? 0 : (u < 2 ? 1 : (u < roverCapacityPackages ? 2 : 3));
    int free = Math.min(2, freeRovers());
    double b = avgBattery();
    int batt = b < 40 ? 0 : (b < 70 ? 1 : 2);
    double h = hourOfDay();
    int block = h < 10 ? 0 : (h < 12 ? 1 : (h < 14 ? 2 : 3));
    double minute = (h * 60) % 60;
    int soon = (minute >= 60 - classChangeMinutes - 10) ? 1 : 0;
    return (((ready * 3 + free) * 3 + batt) * 4 + block) * 2 + soon;
}

public double qReward() {
    double r = qDeliveredUnitsSince
             - rlWaitPenalty * sortedWaitingUnits() * rlDecisionMinutes
             - rlEnergyPenalty * (dayEnergyPct - qEnergyAtLast);
    qDeliveredUnitsSince = 0;
    qEnergyAtLast = dayEnergyPct;
    return r;
}

public int qBestAction(int s) { int a = 0; for (int i = 1; i < Q_ACTIONS; i++) if (qTable[s][i] > qTable[s][a]) a = i; return a; }

public void qLearningStep() {
    if (qEpsilon < 0) qEpsilon = rlEpsilonStart;
    int s = qState();
    double r = qReward();
    if (qPrevState >= 0) {
        double target = r + rlGamma * qTable[s][qBestAction(s)];
        qTable[qPrevState][qPrevAction] += rlAlpha * (target - qTable[qPrevState][qPrevAction]);
        qDayReward += r;
    }
    int a = uniform() < qEpsilon ? uniform_discr(0, Q_ACTIONS - 1) : qBestAction(s);
    applyAction(a);
    qPrevState = s; qPrevAction = a;
}

public void qEndOfDay() {
    if (qPrevState >= 0) {
        double r = qReward() - rlCarryOverPenalty * inMailroom();
        qTable[qPrevState][qPrevAction] += rlAlpha * (r - qTable[qPrevState][qPrevAction]);
        qDayReward += r;
    }
    qPrevState = -1; qPrevAction = -1;
    qEpsilon = Math.max(rlEpsilonMin, (qEpsilon < 0 ? rlEpsilonStart : qEpsilon) * rlEpsilonDecay);
}

// 0 wait, 1 one robot, 2 all free robots, 3 charge
public void applyAction(int a) {
    if (a == 1) sendOneRobot();
    else if (a == 2) { while (sendOneRobot()) { } }
    else if (a == 3) {
        Rover low = null;
        for (Rover r : rovers) if (r.isFree() && (low == null || r.battery < low.battery)) low = r;
        if (low != null && low.battery < chargeTargetPct) requestCharge(low);
    }
}

// PPO hook for Jordan: same state, same 4 actions. Until a trained policy is loaded,
// policy 3 uses the batching rule. Replace the body with the trained network's forward pass.
public int ppoAction() { return batchingRuleSaysGo() ? 1 : 0; }

// ---- CSV output (for the Streamlit dashboard and the report)
public void writeLine(String file, String line, boolean append) {
    try {
        java.io.File f = new java.io.File(outputFolder, file);
        if (f.getParentFile() != null) f.getParentFile().mkdirs();
        try (java.io.FileWriter w = new java.io.FileWriter(f, java.nio.charset.StandardCharsets.UTF_8, append)) { w.write(line + "\n"); }
    } catch (Exception e) { traceln("CSV write failed: " + e); }
}
public void saveQTable() {
    StringBuilder sb = new StringBuilder("state,wait,send_one,send_all,charge");
    for (int s = 0; s < Q_STATES; s++) {
        sb.append("\n").append(s);
        for (int a = 0; a < Q_ACTIONS; a++) sb.append(",").append(String.format(java.util.Locale.US, "%.4f", qTable[s][a]));
    }
    writeLine("q_table.csv", sb.toString(), false);
}
public void loadQTable() {
    try {
        java.io.File f = new java.io.File(outputFolder, "q_table.csv");
        if (!f.exists()) return;
        java.util.List<String> lines = java.nio.file.Files.readAllLines(f.toPath());
        for (int i = 1; i < lines.size() && i <= Q_STATES; i++) {
            String[] p = lines.get(i).split(",");
            for (int a = 0; a < Q_ACTIONS && a + 1 < p.length; a++) qTable[i - 1][a] = Double.parseDouble(p[a + 1]);
        }
        traceln("Loaded Q-table from " + f.getAbsolutePath());
    } catch (Exception e) { traceln("Q-table load failed: " + e); }
}

// ---------------------------------------------------------------------------
// Live bridge to the 3D twin (digital_twin_app server.js: POST /api/anylogic/update)
// ---------------------------------------------------------------------------
public java.util.concurrent.atomic.AtomicInteger twinOk = new java.util.concurrent.atomic.AtomicInteger();
public java.util.concurrent.atomic.AtomicInteger twinFail = new java.util.concurrent.atomic.AtomicInteger();
public java.util.concurrent.atomic.AtomicInteger twinInFlight = new java.util.concurrent.atomic.AtomicInteger();
public java.util.concurrent.ExecutorService twinExec;

public void postToTwin(final String json, final String url) {
    if (twinExec == null) twinExec = java.util.concurrent.Executors.newSingleThreadExecutor(runnable -> {
        Thread t = new Thread(runnable, "twin-bridge"); t.setDaemon(true); return t;
    });
    if (twinInFlight.get() > 5) return;
    twinInFlight.incrementAndGet();
    twinExec.submit(() -> {
        try {
            java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setConnectTimeout(1000); c.setReadTimeout(2000);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (java.io.OutputStream os = c.getOutputStream()) { os.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            c.getInputStream().close();
            c.disconnect();
            if (code == 200) twinOk.incrementAndGet(); else twinFail.incrementAndGet();
        } catch (Exception e) {
            twinFail.incrementAndGet();
        } finally {
            twinInFlight.decrementAndGet();
        }
    });
}
"""

PLAN_DAY = r"""// 07:00 every day: build today's vendor schedule (SYNTHETIC times in the morning window)
int d = dayNumber();
dayArrived = 0; dayEligible = 0; daySameDay = 0; dayDelivered = 0; dayHoursToLocker = 0;
dayEnergyPct = 0; dayDistanceM = 0; dayLateDrops = 0; dayMaxMailroom = 0; qDayReward = 0;
dayLockerFullEvents0 = lockerFullEvents;
// USPS: one drop around 10 AM (Ricardo) - letters, flats and small packages
double usps = triangular(9.25, 10.75, 10.0);
addDrop(0, d, usps, poisson(uspsLettersPerDay), 0);
addDrop(0, d, usps, poisson(uspsPackagesPerDay), 2);
// Amazon: 2-3 drops through the day
int k = uniform_discr(2, 3);
for (int i = 0; i < k; i++) addDrop(1, d, uniform(8.5, 15.5), poisson(amazonPackagesPerDay / k), 2);
addDrop(2, d, uniform(9.0, 12.0), poisson(upsPackagesPerDay), 3);           // UPS
addDrop(3, d, uniform(9.5, 13.0), poisson(fedexPackagesPerDay), 3);         // FedEx
addDrop(4, d, uniform(7.5, 8.5), poisson(newspapersPerDay), 1);             // newspapers, early
int o = uniform_discr(0, 2);
for (int i = 0; i < o; i++) addDrop(5, d, uniform(8.5, 14.0), poisson(otherVendorBoxesPerDrop), 4);"""

ADD_DROP = r"""if (count <= 0) return;
Drop dr = new Drop();
dr.vendor = vendor;
dr.late = uniform() < lateDropProb;                   // rare late truck: after 4 PM, sorted tomorrow
double hour = dr.late ? uniform(sortCutoffHour, robotEndHour) : arriveHour;
dr.arriveAt = timeAtHour(day, hour);
// the mailroom sorts from opening time until the cut-off; later drops wait for tomorrow
dr.dueAt = hour < mailroomOpenHour ? timeAtHour(day, mailroomOpenHour)
         : (hour >= sortCutoffHour ? timeAtHour(day + 1, mailroomOpenHour) : dr.arriveAt);
for (int i = 0; i < count; i++) {
    MailItem m = new MailItem();
    m.id = ++itemCounter; m.type = type; m.vendor = vendor; m.units = type <= 1 ? 1.0 / lettersPerSlot : 1.0;
    m.dest = pickDestination(); m.droppedAt = dr.arriveAt; m.lateDrop = dr.late; m.arrivalDay = day;
    dr.items.add(m);
}
drops.add(dr);"""

PROCESS_DROPS = r"""// every minute: count drops that arrived; drops that are due go into the mailroom flowchart
for (int i = drops.size() - 1; i >= 0; i--) {
    Drop dr = drops.get(i);
    if (time() >= dr.arriveAt && !dr.counted) {
        dr.counted = true;
        dayArrived += dr.items.size();
        totalArrived += dr.items.size();
        if (dr.late) dayLateDrops++;
        else { dayEligible += dr.items.size(); totalEligible += dr.items.size(); }
    }
    if (time() >= dr.dueAt) {
        for (MailItem m : dr.items) {
            m.status = 1;
            notYetSorting++;
            injectQueue.add(m);
            mailArrivals.inject(1);
        }
        drops.remove(i);
    }
}
dayMaxMailroom = Math.max(dayMaxMailroom, inMailroom());"""

# AnyLogic: triangular(min, max, mode)
SORT_SECONDS = r"""MailItem m = itemOf.get(a);
if (m == null) return 10;
switch (m.type) {
    case 0: return triangular(3, 10, 5);      // letter          (SYNTHETIC)
    case 1: return triangular(2, 6, 3);       // newspaper
    case 2: return triangular(20, 60, 30);    // small package (scan + label)
    case 3: return triangular(30, 90, 45);    // medium package
    default: return triangular(45, 120, 60);  // large package
}"""

ON_SOURCE_EXIT = r"""MailItem m = injectQueue.poll();
if (m != null) { itemOf.put(a, m); m.sortStart = time(); notYetSorting--; inSorting++; }"""

ON_SORTED = r"""MailItem m = itemOf.remove(a);
if (m == null) return;
inSorting--;
m.sortedAt = time();
m.status = 2;
if (m.dest == depotNode) placeInLocker(m);            // mail for Building 3 stays in the building
else outbox.get(m.dest).add(m);"""

PLACE = r"""m.status = 4;
m.lockerAt = time();
dayDelivered++; totalDelivered++;
double hours = (m.lockerAt - m.droppedAt) / 3600.0;
dayHoursToLocker += hours; totalHoursToLocker += hours;
if (!m.lateDrop && dayNumber() == m.arrivalDay) { daySameDay++; totalSameDay++; }
qDeliveredUnitsSince += m.units;
// an office worker collects it later (SYNTHETIC: exponential, office hours only)
double t = time() + exponential(1.0 / (lockerPickupHours * 3600));
double h = ((startHour + t / 3600.0) % 24.0);
if (h >= robotEndHour || h < mailroomOpenHour) {
    int day = (int) Math.floor((startHour + t / 3600.0) / 24.0) + 1 + (h >= robotEndHour ? 1 : 0);
    t = timeAtHour(day, mailroomOpenHour + uniform(0.25, 1.5));
}
m.collectAt = t;
inLockers.add(m);"""

RETURN_TO_OUTBOX = r"""m.status = 2;
m.attempts++;
outbox.get(m.dest).add(m);"""

COLLECT = r"""for (int i = inLockers.size() - 1; i >= 0; i--) {
    MailItem m = inLockers.get(i);
    if (time() >= m.collectAt) {
        if (m.dest != depotNode) lockerUsed[m.dest] = Math.max(0, lockerUsed[m.dest] - m.units);
        m.status = 5; m.collectedAt = time();
        inLockers.remove(i);
    }
}"""

# load a robot: fullest building first, then the nearest buildings, until the bins are full
SEND_ONE = r"""Rover best = null;
for (Rover r : rovers) if (r.isFree() && r.curNode == depotNode && r.battery > chargingThresholdPct) { best = r; break; }
if (best == null) return false;
int first = -1; double most = 0;
for (int b : buildingNodes) {
    double u = 0; for (MailItem m : outbox.get(b)) u += m.units;
    if (u > most) { most = u; first = b; }
}
if (first < 0) return false;
java.util.ArrayList<MailItem> load = new java.util.ArrayList<MailItem>();
int slotsLeft = roverCapacityPackages;          // e.g. 5 packages per robot (Ricardo)
java.util.ArrayList<Integer> order = new java.util.ArrayList<Integer>();
order.add(first);
if (dispatchPolicy != 0) {          // baseline = one building per trip
    java.util.ArrayList<Integer> rest = new java.util.ArrayList<Integer>();
    for (int b : buildingNodes) if (b != first && !outbox.get(b).isEmpty()) rest.add(b);
    final int f0 = first;
    rest.sort((x, y) -> Double.compare(spDist[f0][x], spDist[f0][y]));
    order.addAll(rest);
}
for (int b : order) {
    java.util.ArrayList<MailItem> q = outbox.get(b);
    int flatsHere = 0;                          // letters + newspapers for this building
    for (int i = 0; i < q.size(); ) {
        MailItem m = q.get(i);
        boolean flat = m.type <= 1;
        // a package needs a slot; a letter needs a new slot only when its bundle of lettersPerSlot is full
        int need = flat ? (flatsHere % lettersPerSlot == 0 ? 1 : 0) : 1;
        if (need <= slotsLeft) { load.add(m); slotsLeft -= need; if (flat) flatsHere++; q.remove(i); }
        else i++;
    }
    if (slotsLeft <= 0) break;
}
if (load.isEmpty()) return false;
best.startTrip(load);
return true;"""

BATCH_RULE = r"""// batching rule: go when the mail ready fills batchFillPct of a robot, or the oldest
// sorted item has waited batchHoldMinutes, or the robots' day is about to end
double units = sortedWaitingUnits();
if (units <= 0.01) return false;
double oldest = Double.MAX_VALUE;
for (java.util.ArrayList<MailItem> q : outbox) for (MailItem m : q) oldest = Math.min(oldest, m.sortedAt);
return units >= batchFillPct / 100.0 * roverCapacityPackages
    || time() - oldest >= batchHoldMinutes * 60
    || hourOfDay() >= robotEndHour - 0.75;"""

DISPATCH = r"""// every 30 s while the robots are on duty
if (!robotsOnDuty()) return;
if (dispatchPolicy == 0) { while (sortedWaiting() > 0 && sendOneRobot()) { } }      // baseline: send at once
else if (dispatchPolicy == 1) { while (batchingRuleSaysGo() && sendOneRobot()) { } }
else if (dispatchPolicy == 3) { applyAction(ppoAction()); }
// policy 2 (Q-learning) decides in the rlDecision event"""

REQUEST_CHARGE = r"""if (padsBusy < numberOfChargingPads) { padsBusy++; r.setPhase("Charging"); }
else { chargeQueue.add(r); r.setPhase("WaitingCharger"); }"""

FINISH_CHARGE = r"""padsBusy--;
r.setPhase("Idle");
if (!chargeQueue.isEmpty()) { Rover next = chargeQueue.remove(0); padsBusy++; next.setPhase("Charging"); }"""

STEP = r"""// walkers: background traffic, crowds at every class change (8:00-21:00)
double h = hourOfDay();
int target = (h < 7.5 || h > 21.5) ? 0 : (classChangeNow() ? walkersAtClassChange : walkersBackground);
int act = activeWalkers();
for (Walker w : walkers) {
    if (act >= target) break;
    if (!w.active) {
        int from = buildingNodes[uniform_discr(0, buildingNodes.length - 1)];
        int to = from;
        while (to == from) to = buildingNodes[uniform_discr(0, buildingNodes.length - 1)];
        w.startWalk(from, to);
        act++;
    }
}
for (int i = 0; i < crowd.length; i++) java.util.Arrays.fill(crowd[i], 0);
for (Walker w : walkers) { w.step(stepSec); if (w.active && w.edgeFrom >= 0) crowd[w.edgeFrom][w.edgeTo]++; }
for (Rover r : rovers) r.step(stepSec);
// idle robots that are low go to the chargers at the mailroom
for (Rover r : rovers)
    if (r.isFree() && r.battery <= chargingThresholdPct) {
        if (r.curNode == depotNode) requestCharge(r);
        else { r.goTo(depotNode); r.setPhase("Returning"); }
    }"""

DAY_END = r"""// 17:30 every day: daily KPIs to CSV, Q-learning episode ends
int d = dayNumber();
if (dispatchPolicy == 2) qEndOfDay();
String line = d + "," + dispatchPolicy + "," + dayArrived + "," + dayEligible + "," + daySameDay + ","
    + f1(sameDayPctToday()) + "," + dayDelivered + "," + f1(dayDelivered == 0 ? 0 : dayHoursToLocker / dayDelivered) + ","
    + inMailroom() + "," + dayMaxMailroom + "," + dayLateDrops + "," + f1(dayDistanceM / 1000.0) + "," + f1(dayEnergyPct) + ","
    + (lockerFullEvents - dayLockerFullEvents0) + "," + f1(mailClerks.utilization() * 100) + "," + f1(qDayReward) + ","
    + f1(dispatchPolicy == 2 ? qEpsilon : 0);
writeLine("daily_kpis.csv", line, true);
if (dispatchPolicy == 2) saveQTable();
traceln(clockText() + "  arrived " + dayArrived + ", same-day " + f1(sameDayPctToday()) + "%, delivered " + dayDelivered
        + ", left in mailroom " + inMailroom());
if (d >= workDays) finishSimulation();"""

SEND_TWIN = r"""StringBuilder sb = new StringBuilder();
sb.append("{\"source\":\"AnyLogic\",\"simTime\":").append(f1(time()))
  .append(",\"clock\":\"").append(clockText()).append("\",\"robots\":[");
for (int i = 0; i < rovers.size(); i++) {
    Rover r = rovers.get(i);
    if (i > 0) sb.append(",");
    sb.append(String.format(java.util.Locale.US,
        "{\"id\":\"%s\",\"x\":%.3f,\"y\":0.05,\"z\":%.3f,\"heading\":%.4f,\"battery\":%.1f,\"speed\":%.2f,\"status\":\"%s\",\"cargo\":%d,\"slots\":%d}",
        r.roverName, r.posX / metersPerTwinUnit, r.posY / metersPerTwinUnit, r.headingRad, r.battery,
        r.speedNow, r.phase, r.cargo.size(), r.cargoSlots()));
}
sb.append("],\"pedestrians\":[");
boolean first = true;
for (int i = 0; i < walkers.size(); i++) {
    Walker w = walkers.get(i);
    if (!w.active) continue;
    if (!first) sb.append(",");
    first = false;
    sb.append(String.format(java.util.Locale.US, "{\"id\":\"ped-%d\",\"x\":%.3f,\"z\":%.3f}", i + 1,
        w.posX / metersPerTwinUnit, w.posY / metersPerTwinUnit));
}
sb.append("]}");
postToTwin(sb.toString(), twinUrl);"""

STARTUP = r"""buildGraph();
depotNode = indexOfNode(depotKey);
for (int i = 0; i < rovers.size(); i++) {
    Rover r = rovers.get(i);
    r.roverName = String.format("AMR-%02d", i + 1);     // same ids as the 3D twin fleet
    r.curNode = depotNode; r.posX = nodeX[depotNode]; r.posY = nodeY[depotNode];
}
writeLine("daily_kpis.csv", "day,policy,arrived,eligible,same_day,same_day_pct,delivered,avg_hours_to_locker,"
    + "left_in_mailroom,max_in_mailroom,late_drops,robot_km,energy_pct,locker_full_events,clerk_util_pct,q_reward,q_epsilon", false);
if (dispatchPolicy == 2 && rlLoadQTable) loadQTable();
traceln("MDC Campus Courier v2: " + nodeKey.length + " walkway nodes, " + edgeList.length + " links, "
        + buildingNodes.length + " buildings, " + rovers.size() + " robots, " + walkers.size() + " walkers, "
        + "mailroom = " + nodeName[depotNode] + ", " + workDays + " working days, policy " + dispatchPolicy);"""

# (name, type, default, label) - label says where the value comes from
PARAMS = [
    ("workDays", "int", "30", "Working days to simulate (Ricardo: one month)"),
    ("dispatchPolicy", "int", "1", "0 baseline, 1 batching, 2 Q-learning, 3 PPO"),
    ("numberOfRovers", "int", "6", "Robots (3D twin AMR-01..06)"),
    ("roverCapacityPackages", "int", "5", "Packages per robot (Ricardo)"),
    ("lettersPerSlot", "int", "25", "Letters per bundle = 1 package slot (Ricardo)"),
    ("roverSpeedMps", "double", "1.2", "Robot speed m/s ASSUMPTION"),
    ("numberOfClerks", "int", "3", "Mailroom staff sorting (Ricardo)"),
    ("officeSpec", "String", f'"{OFFICE_SPEC}"', "Offices per building (MDC directory)"),
    ("depotKey", "String", '"b3"', "Mailroom node: Bldg 3, Room 3103 (directory)"),
    ("mailroomOpenHour", "double", "8", "Mailroom opens (hour)"),
    ("sortCutoffHour", "double", "16", "Drops after this go to the next day (Ricardo)"),
    ("robotEndHour", "double", "17", "Robots stop delivering (hour)"),
    ("uspsLettersPerDay", "double", "180", "USPS letters per day SYNTHETIC"),
    ("uspsPackagesPerDay", "double", "15", "USPS small packages per day SYNTHETIC"),
    ("amazonPackagesPerDay", "double", "25", "Amazon packages per day SYNTHETIC"),
    ("upsPackagesPerDay", "double", "10", "UPS packages per day SYNTHETIC"),
    ("fedexPackagesPerDay", "double", "8", "FedEx packages per day SYNTHETIC"),
    ("newspapersPerDay", "double", "20", "Newspapers per day SYNTHETIC"),
    ("otherVendorBoxesPerDrop", "double", "3", "Boxes per other-vendor drop SYNTHETIC"),
    ("lateDropProb", "double", "0.05", "Chance a drop comes after 4 PM SYNTHETIC"),
    ("batchFillPct", "double", "60", "Batching: go when robot this % full"),
    ("batchHoldMinutes", "double", "45", "Batching: max wait after sorting, min"),
    ("loadSecondsBase", "double", "60", "Loading a robot, base s ASSUMPTION"),
    ("loadSecondsPerItem", "double", "4", "Loading per item, s ASSUMPTION"),
    ("lockerSecondsBase", "double", "60", "Locker drop-off, base s ASSUMPTION"),
    ("lockerSecondsPerItem", "double", "5", "Locker drop-off per item, s ASSUMPTION"),
    ("lockerBaseSlots", "double", "4", "Locker slots per building ASSUMPTION"),
    ("lockerSlotsPerOffice", "double", "1.5", "Extra locker slots per office ASSUMPTION"),
    ("lockerPickupHours", "double", "1.5", "Mean hours until an office collects ASSUMPTION"),
    ("numberOfChargingPads", "int", "2", "Charging pads at the mailroom (proposal)"),
    ("chargingThresholdPct", "double", "20", "Charge at or below % (3D twin)"),
    ("chargeTargetPct", "double", "90", "Leave the charger at % (proposal)"),
    ("chargeRatePctPerMin", "double", "0.8", "Charging speed %/min (proposal)"),
    ("batteryUsePctPerKm", "double", "5", "Battery per km, % ASSUMPTION"),
    ("walkersBackground", "int", "10", "Students walking between classes SYNTHETIC"),
    ("walkersAtClassChange", "int", "60", "Students walking at class change SYNTHETIC"),
    ("maxWalkers", "int", "80", "Walker agents in the model"),
    ("classChangeMinutes", "double", "10", "Class change = last minutes of each hour"),
    ("crowdImpactPerWalker", "double", "0.15", "Slow-down per student on a segment ASSUMPTION"),
    ("minCrowdSpeedFactor", "double", "0.3", "Slowest speed in a crowd, share ASSUMPTION"),
    ("metersPerTwinUnit", "double", "75", "Meters per 3D-twin unit ASSUMPTION (calibrate)"),
    ("startHour", "double", "7", "Clock hour at time 0 (Day 1)"),
    ("stepSec", "double", "2", "Movement time step, s"),
    ("rlDecisionMinutes", "double", "5", "Q-learning: minutes between decisions"),
    ("rlAlpha", "double", "0.1", "Q-learning rate"),
    ("rlGamma", "double", "0.95", "Q-learning discount"),
    ("rlEpsilonStart", "double", "1.0", "Q-learning exploration at day 1"),
    ("rlEpsilonMin", "double", "0.05", "Q-learning minimum exploration"),
    ("rlEpsilonDecay", "double", "0.9", "Q-learning exploration decay per day"),
    ("rlWaitPenalty", "double", "0.02", "Reward: penalty per waiting unit-minute"),
    ("rlEnergyPenalty", "double", "0.5", "Reward: penalty per % battery used"),
    ("rlCarryOverPenalty", "double", "0.5", "Reward: penalty per item left at day end"),
    ("rlLoadQTable", "boolean", "false", "Start from saved output/q_table.csv"),
    ("outputFolder", "String", '"output"', "Folder for daily_kpis.csv and q_table.csv"),
    ("enableTwinBridge", "boolean", "false", "Send robots and walkers to the 3D twin"),
    ("twinUrl", "String", '"http://localhost:3000/api/anylogic/update"', "3D twin endpoint"),
    ("twinIntervalSec", "double", "2", "Model seconds between 3D updates"),
]

STATE_VARS = [
    ("depotNode", "int", "0"), ("padsBusy", "int", "0"), ("lockerFullEvents", "int", "0"),
    ("notYetSorting", "int", "0"), ("inSorting", "int", "0"),
    ("dayArrived", "int", "0"), ("dayEligible", "int", "0"), ("daySameDay", "int", "0"), ("dayDelivered", "int", "0"),
    ("dayHoursToLocker", "double", "0"), ("dayEnergyPct", "double", "0"), ("dayDistanceM", "double", "0"),
    ("dayLateDrops", "int", "0"), ("dayMaxMailroom", "int", "0"), ("dayLockerFullEvents0", "int", "0"),
    ("totalArrived", "int", "0"), ("totalEligible", "int", "0"), ("totalSameDay", "int", "0"),
    ("totalDelivered", "int", "0"), ("totalHoursToLocker", "double", "0"),
]

main_vars = "".join(
    parameter(n, t, d, 20 + 360 * (i // 20), 960 + 22 * (i % 20), lbl,
              editor="CHECK_BOX" if t == "boolean" else "TEXT_BOX")
    for i, (n, t, d, lbl) in enumerate(PARAMS)
) + "".join(variable(n, t, v, 1120 + 180 * (i // 10), 960 + 22 * (i % 10)) for i, (n, t, v) in enumerate(STATE_VARS))

main_funcs = (
    function("planDay", None, [], PLAN_DAY, 1500, 960)
    + function("addDrop", None, [("vendor", "int"), ("day", "int"), ("arriveHour", "double"), ("count", "int"),
                                 ("type", "int")], ADD_DROP, 1500, 982)
    + function("processDrops", None, [], PROCESS_DROPS, 1500, 1004)
    + function("sortSeconds", "double", [("a", "Agent")], SORT_SECONDS, 1500, 1026)
    + function("onEnterSorting", None, [("a", "Agent")], ON_SOURCE_EXIT, 1500, 1048)
    + function("onSorted", None, [("a", "Agent")], ON_SORTED, 1500, 1070)
    + function("placeInLocker", None, [("m", "MailItem")], PLACE, 1500, 1092)
    + function("returnToOutbox", None, [("m", "MailItem")], RETURN_TO_OUTBOX, 1500, 1114)
    + function("collectFromLockers", None, [], COLLECT, 1500, 1136)
    + function("sendOneRobot", "boolean", [], SEND_ONE, 1500, 1158)
    + function("batchingRuleSaysGo", "boolean", [], BATCH_RULE, 1500, 1180)
    + function("dispatch", None, [], DISPATCH, 1500, 1202)
    + function("requestCharge", None, [("r", "Rover")], REQUEST_CHARGE, 1500, 1224)
    + function("finishCharging", None, [("r", "Rover")], FINISH_CHARGE, 1500, 1246)
    + function("endOfDay", None, [], DAY_END, 1500, 1268)
    + function("sendTwinUpdate", None, [], SEND_TWIN, 1500, 1290)
)
main_events = (
    cyclic_event("movementStep", 0, "stepSec", STEP, 1700, 960)
    + cyclic_event("dayStart", 0, DAY, "planDay();", 1700, 982)
    + cyclic_event("minuteTick", 30, 60, "processDrops();\ncollectFromLockers();", 1700, 1004)
    + cyclic_event("dispatchEvent", 15, 30, "dispatch();", 1700, 1026)
    + cyclic_event("rlDecision", 3600, "rlDecisionMinutes * 60",
                   "if (dispatchPolicy == 2 && robotsOnDuty()) qLearningStep();", 1700, 1048)
    + cyclic_event("dayEnd", round(10.5 * 3600), DAY, "endOfDay();", 1700, 1070)
    + cyclic_event("twinBridge", 1, "twinIntervalSec", "if (enableTwinBridge) sendTwinUpdate();", 1700, 1092)
)


def population(name, cls, gp, count, x, y):
    xml = fighter_instance(name, gp, x, y, [])
    xml = xml.replace(f"<ClassName>{cd('Fighter')}</ClassName>", f"<ClassName>{cd(cls)}</ClassName>")
    xml = xml.replace("<ReplicationFlag>false</ReplicationFlag>", "<ReplicationFlag>true</ReplicationFlag>")
    xml = xml.replace(f"<Replication Class=\"CodeValue\">\n<Code>{cd('100')}</Code>",
                      f"<Replication Class=\"CodeValue\">\n<Code>{cd(count)}</Code>")
    assert count in xml and "Fighter" not in xml
    return xml


# ---------------------------------------------------------------- mailroom flowchart (Process Modeling Library)
def flowchart(x0, y0):
    tpl = open(PML_TEMPLATES, encoding="utf-8").read()
    blocks = dict(re.findall(r"<!--BLOCK (\w+)-->\n(<EmbeddedObject>.*?</EmbeddedObject>)", tpl, re.S))
    cons = re.findall(r"<!--CONNECTOR-->\n(<Connector>.*?</Connector>)", tpl, re.S)
    rename = {"RawMaterialDeliveries": "mailArrivals", "Processing": "mailSorting",
              "resourcePool": "mailClerks", "sink": "sortedMail"}

    def fix(xml):
        xml = re.sub(r"<Id>\d+</Id>", lambda m: f"<Id>{nid()}</Id>", xml)
        xml = xml.replace(cd("r_incoming_message_injects_agents"), cd(PKG))
        for old, new in rename.items():
            # only the block's own name (first <Name>), never a parameter called the same
            if xml.startswith("<EmbeddedObject>"):
                first = xml.find("<Name>")
                if xml.startswith(f"<Name>{cd(old)}</Name>", first):
                    xml = xml[:first] + f"<Name>{cd(new)}</Name>" + xml[first + len(f"<Name>{cd(old)}</Name>"):]
            xml = xml.replace(f"<ItemName>{cd(old)}</ItemName>", f"<ItemName>{cd(new)}</ItemName>")
        return xml

    def set_param(xml, pname, code, unit=None):
        pat = re.compile(r"(<Parameter>\s*<Name>" + re.escape(cd(pname)) + r"</Name>\s*<Value Class=\"Code(?:Unit)?Value\">\s*)"
                         r"(<Code>.*?</Code>)?(\s*(?:<Unit Class=\"\w+\">.*?</Unit>)?)", re.S)
        m = pat.search(xml)
        if not m:   # parameter left empty in the template: <Parameter><Name>x</Name></Parameter>
            empty = re.compile(r"(<Parameter>\s*<Name>" + re.escape(cd(pname)) + r"</Name>)(\s*</Parameter>)")
            e = empty.search(xml)
            assert e, f"parameter {pname} not in template"
            return xml[:e.start()] + e.group(1) + f"\n<Value Class=\"CodeValue\">\n<Code>{cd(code)}</Code>\n</Value>" \
                + e.group(2) + xml[e.end():]
        unit_xml = m.group(3)
        if unit:
            unit_xml = re.sub(r"<!\[CDATA\[\w+\]\]>", cd(unit), unit_xml)
        return xml[:m.start()] + m.group(1) + f"<Code>{cd(code)}</Code>" + unit_xml + xml[m.end():]

    def place(xml, x, y):
        return re.sub(r"<X>-?\d+</X><Y>-?\d+</Y>", f"<X>{x}</X><Y>{y}</Y>", xml, count=1)

    src = set_param(fix(blocks["RawMaterialDeliveries"]), "onExit", "onEnterSorting(agent);")
    svc = fix(blocks["Processing"])
    svc = set_param(svc, "delayTime", "sortSeconds(agent)", unit="SECOND")
    svc = set_param(svc, "resourcePool", "mailClerks")
    pool = set_param(fix(blocks["resourcePool"]), "capacity", "numberOfClerks")
    snk = set_param(fix(blocks["sink"]), "onEnter", "onSorted(agent);")
    embedded = (place(src, x0, y0) + "\n" + place(svc, x0 + 150, y0 - 10) + "\n"
                + place(pool, x0 + 150, y0 + 90) + "\n" + place(snk, x0 + 310, y0))
    connectors = ""
    for c in cons:
        c = fix(c)
        first = "<ItemName><![CDATA[mailArrivals]]></ItemName>" in c
        c = place(c, x0 + 30 if first else x0 + 210, y0 + 10)
        c = re.sub(r"<Points>.*?</Points>", "<Points>\n<Point><X>0</X><Y>0</Y></Point>\n<Point><X>"
                   + ("120" if first else "100") + "</X><Y>0</Y></Point>\n</Points>", c, flags=re.S)
        connectors += c + "\n"
    return embedded, connectors


FLOW_X, FLOW_Y = 80, 800
flow_embedded, flow_connectors = flowchart(FLOW_X, FLOW_Y)


# ---------------------------------------------------------------- presentation
def campus_map():
    xml = rect(20, 120, 860, 620, argb(226, 238, 226), line=argb(160, 180, 160))
    xml += rect(px(-2.0), py(-1.05), round(4.05 * PXU), round(2.1 * PXU), argb(170, 205, 235))
    xml += text(px(0.0), py(0.0), "Central Lake", size=12, align="CENTER", color=argb(70, 110, 150))
    for a, b in EDGES:
        xml += line(px(NODES[a][2]), py(NODES[a][3]), px(NODES[b][2]), py(NODES[b][3]), argb(120, 120, 120), 3)
    for i, (k, _name, x, z, _) in enumerate(NODES):
        if k in BUILDING_LABEL:
            mail = k == "b3"
            xml += oval(px(x), py(z), 14 if mail else 11, argb(200, 40, 40) if mail else argb(0, 71, 186),
                        line=argb(255, 255, 255))
            xml += text(px(x), py(z) - 28, BUILDING_LABEL[k], size=11, bold=True, align="CENTER",
                        color=argb(160, 20, 20) if mail else argb(0, 50, 140))
            xml += text(px(x), py(z) + 15, "", code=f"buildingText({i})", size=9, align="CENTER", color=argb(60, 60, 60))
        else:
            xml += oval(px(x), py(z), 3, argb(90, 90, 90), line=argb(90, 90, 90))
    return xml


def agents_on_map():
    xml = ""
    for i in range(MAX_WALKERS_DRAWN):
        xml += oval(0, 0, 3, argb(250, 120, 180), xcode=f"walkerPx({i})", ycode=f"walkerPy({i})", line=argb(150, 40, 90))
    for i in range(MAX_ROVERS_DRAWN):
        xml += oval(0, 0, 9, argb(150, 150, 150), fill_code=f"roverColor({i})",
                    xcode=f"roverPx({i})", ycode=f"roverPy({i})", line=argb(20, 20, 20))
        xml += text(0, 0, "", code=f"roverLabel({i})", size=9, bold=True, align="CENTER",
                    color=argb(255, 255, 255), xcode=f"roverPx({i})", ycode=f"roverPy({i}) - 6")
    return xml


KPI = ('"TODAY  arrived " + dayArrived + "   delivered to lockers " + dayDelivered + "   late drops " + dayLateDrops + "\\n'
       'Same-day delivery today: " + f1(sameDayPctToday()) + " %     all days: " + f1(sameDayPctAll()) + " %\\n'
       'Avg hours from vendor drop to locker: " + f1(avgHoursToLocker()) + "\\n'
       'Mailroom: waiting to sort " + notYetSorting + ", sorting " + inSorting + ", sorted for robots " + sortedWaiting()'
       ' + "  (" + f1(sortedWaitingUnits()) + " robot slots)\\n'
       'Clerks busy: " + mailClerks.busy() + " / " + numberOfClerks + "   robots busy: " + busyRovers() + " / " + rovers.size()'
       ' + "   students walking: " + activeWalkers() + "\\n'
       'Avg battery: " + f1(avgBattery()) + " %   charging " + padsBusy + "/" + numberOfChargingPads + " pads, queue " + chargeQueue.size()'
       ' + "\\nLocker-full events: " + lockerFullEvents + "   robot km today: " + f1(dayDistanceM / 1000.0)'
       ' + (dispatchPolicy == 2 ? "\\nQ-learning: epsilon " + f1(qEpsilon < 0 ? rlEpsilonStart : qEpsilon) + "   reward today " + f1(qDayReward) : "")')

POLICY = ('(dispatchPolicy == 0 ? "baseline (send at once, 1 building per trip)" : dispatchPolicy == 1 ? "batching" '
          ': dispatchPolicy == 2 ? "Q-learning" : "PPO")')

main_pres = (
    rect(0, 0, 1400, 900, argb(248, 248, 248))
    + text(20, 12, "MDC North Campus Mail Service - Autonomous Courier Robots (Option 2)", size=20, bold=True)
    + text(20, 44, "", code=f'clockText() + (classChangeNow() ? "   CLASS CHANGE: walkways crowded" : "") + "   |   policy: " + {POLICY}'
                            ' + "   |   day " + dayNumber() + " of " + workDays', size=13)
    + text(20, 66, "", code='"3D twin bridge: " + (enableTwinBridge ? "ON -> " + twinUrl + "   sent " + twinOk.get() + ", failed " + twinFail.get() : "off")',
           size=11, color=argb(90, 90, 90))
    + text(20, 90, "Robots: gray idle - orange loading / locker - green delivering - purple returning - red charging."
                   "   Pink dots: students walking.", size=11, color=argb(90, 90, 90))
    + campus_map()
    + agents_on_map()
    + text(900, 120, "", code=KPI, size=12)
    + time_plot("mailroomPlot", 900, 330, 480, 230, [
        ("Items in mailroom", "mailroomDS", "inMailroom()", argb(220, 120, 30)),
        ("Robots busy", "busyDS", "busyRovers()", argb(40, 90, 200)),
        ("Students walking", "walkersDS", "activeWalkers()", argb(230, 110, 170))], 120)
    + time_plot("servicePlot", 900, 570, 480, 230, [
        ("Same-day % (all days)", "sameDayDS", "sameDayPctAll()", argb(40, 160, 80)),
        ("Avg battery %", "batteryDS", "avgBattery()", argb(200, 50, 50))], 100)
    + text(FLOW_X - 40, FLOW_Y - 50, "Mailroom process (DES): vendor drops -> sorting by 3 clerks -> sorted mail for the robots",
           size=12, bold=True)
)

main_xml, _ = agent_class(
    "Main", startup=STARTUP,
    extra_code=MAIN_CODE.replace("@KEYS@", jstr(KEYS)).replace("@NAMES@", jstr([n[1] for n in NODES]))
    .replace("@TX@", jnum([n[2] for n in NODES])).replace("@TZ@", jnum([n[3] for n in NODES]))
    .replace("@EDGES@", "{" + ", ".join("{%d, %d}" % e for e in EDGES) + "}")
    .replace("@BKEYS@", jstr(BUILDINGS)).replace("@BLABELS@", jstr([BUILDING_LABEL[b] for b in BUILDINGS]))
    .replace("@OX@", str(OX)).replace("@OY@", str(OY)).replace("@PXU@", str(PXU)),
    variables=main_vars, events=main_events, functions=main_funcs,
    embedded=population("rovers", "Rover", ROVER_GP, "numberOfRovers", 1700, 1150)
    + population("walkers", "Walker", WALKER_GP, "maxWalkers", 1700, 1190) + flow_embedded,
    presentation=main_pres)
main_xml = main_xml.replace("</Variables>\n", "</Variables>\n<Connectors>\n" + flow_connectors + "</Connectors>\n", 1)
# plots: sample every 10 minutes and show the last 3 days
main_xml = main_xml.replace(f"<Code>{cd('3')}</Code>\n<Unit Class=\"TimeUnits\">{cd('SECOND')}</Unit>\n</RecurrenceCode>",
                            f"<Code>{cd('600')}</Code>\n<Unit Class=\"TimeUnits\">{cd('SECOND')}</Unit>\n</RecurrenceCode>") \
                   .replace(f"<TimeWindowExpression>{cd('900')}</TimeWindowExpression>",
                            f"<TimeWindowExpression>{cd(str(3 * DAY))}</TimeWindowExpression>") \
                   .replace("<SamplesToKeep>400</SamplesToKeep>", "<SamplesToKeep>600</SamplesToKeep>")
MAIN_ID = main_xml.split("<Id>")[1].split("</Id>")[0]

DESCRIPTION = ("Option 2: MDC North Campus mail service with autonomous courier robots. Vendors (USPS, Amazon, UPS, "
               "FedEx, newspapers, others) drop mail at the Duplicating & Mail Center (Building 3, Room 3103); 3 clerks "
               "sort it (DES flowchart); robots carry it along the walkways to lockers at each building, slowed by "
               "students at class changes (ABM). Dispatch policies: baseline, batching, Q-learning (in model), PPO "
               "(hook). Runs for workDays working days and writes output/daily_kpis.csv and output/q_table.csv.")


def build():
    model = assemble("MDC_Campus_Courier", PKG, main_xml, rover_xml + walker_xml, MAIN_ID, frame_w=1400,
                     frame_h=900, title="MDC Campus Courier : Simulation", description=DESCRIPTION)
    exp_params = "".join(f"<Parameter>\n<ParameterName>{cd(n)}</ParameterName>\n</Parameter>\n" for n, *_ in PARAMS)
    model = re.sub(r"<Parameters>\n<Parameter>\n<ParameterName><!\[CDATA\[counterWhenHurt\]\]></ParameterName>\n</Parameter>\n</Parameters>",
                   lambda m: f"<Parameters>\n{exp_params}</Parameters>", model)
    model = model.replace("UFC Agent-Based Model: Kicker vs Boxer", "MDC Campus Mail Robots (Option 2)")
    # safety stop after 60 days; the model itself stops after workDays (endOfDay)
    model = model.replace(cd("905.0"), cd(str(60.0 * DAY))).replace(cd("1762820105000"),
                                                                   cd(str(1762819200000 + 60 * DAY * 1000)))
    model = model.replace("<RealTimeScale>10.0</RealTimeScale>", "<RealTimeScale>60.0</RealTimeScale>")
    lib = ("<RequiredLibraryReference>\n<LibraryName>" + cd("com.anylogic.libraries.processmodeling")
           + "</LibraryName>\n<VersionMajor>8</VersionMajor>\n<VersionMinor>0</VersionMinor>\n<VersionBuild>5</VersionBuild>\n"
           + "</RequiredLibraryReference>\n")
    model = model.replace("<RequiredLibraryReference>", lib + "<RequiredLibraryReference>", 1)
    assert "counterWhenHurt" not in model and "Fighter" not in model and "r_incoming" not in model
    return model


if __name__ == "__main__":
    model = build()
    with open(OUT, "w", encoding="utf-8", newline="\r\n") as fh:
        fh.write(model)
    print(f"wrote {OUT} ({len(model):,} chars): {len(NODES)} walkway nodes, {len(EDGES)} links, "
          f"{len(BUILDINGS)} buildings, {len(PARAMS)} parameters")
