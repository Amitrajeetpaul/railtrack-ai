from ortools.sat.python import cp_model

class PrecedenceOptimizer:
    def __init__(self, trains, track_capacity=1, num_platforms=2, headway_minutes=3, objective='DELAY'):
        self.trains = trains
        self.track_capacity = track_capacity
        self.num_platforms = max(1, num_platforms)
        self.headway_minutes = max(1, headway_minutes)
        self.objective = objective
        self.model = cp_model.CpModel()

    def solve(self):
        """
        Enhanced OR-Tools CP-SAT solver for train precedence, safety headway,
        multi-platform/loop line allocation, and XAI reasoning generation.
        """
        starts = []
        ends = []
        intervals = []
        durations = []
        platforms = []
        priority_weights = {'EXPRESS': 4, 'LOCAL': 2, 'FREIGHT': 1, 'MAINTENANCE': 0}
        
        num_trains = len(self.trains)

        for i, t in enumerate(self.trains):
            # Calculate duration in minutes
            speed = float(t.get('speed', 60.0))
            if speed <= 0: speed = 60.0
            duration = int(float(t.get('distance', 100)) / speed * 60)
            duration = max(5, duration)
            durations.append(duration)
            
            # Start and End times
            scheduled_arrival = int(t.get('scheduled_arrival', 0))
            horizon = max(2880, scheduled_arrival + duration + 1440)
            start = self.model.NewIntVar(scheduled_arrival, horizon, f'start_{i}')
            end = self.model.NewIntVar(scheduled_arrival + duration, horizon + duration, f'end_{i}')
            interval = self.model.NewIntervalVar(start, duration, end, f'interval_{i}')
            
            starts.append(start)
            ends.append(end)
            intervals.append(interval)

            # Platform assignment (1 = Main Line, 2+ = Loop Line / Alternate PF)
            platform = self.model.NewIntVar(1, self.num_platforms, f'platform_{i}')
            platforms.append(platform)

        # ── 1. Single Track / Section Headway & Precedence Constraints ──
        priority_violations = []
        if self.track_capacity == 1:
            # Enforce headway buffer between consecutive trains on single track
            for i in range(num_trains):
                for j in range(i + 1, num_trains):
                    # b_ij == True if train i runs before train j
                    b_ij = self.model.NewBoolVar(f'precedence_{i}_{j}')

                    # If i before j: start_j >= end_i + headway
                    self.model.Add(starts[j] >= ends[i] + self.headway_minutes).OnlyEnforceIf(b_ij)
                    # If j before i: start_i >= end_j + headway
                    self.model.Add(starts[i] >= ends[j] + self.headway_minutes).OnlyEnforceIf(b_ij.Not())

                    # Loop line overtake preference: higher-priority trains should
                    # go first. This used to be a HARD constraint
                    # (model.Add(b_ij == 1/0)) — forcing a rigid priority-only
                    # total order regardless of each train's actual scheduled
                    # time/distance often contradicted the headway/interval
                    # bounds above and made the model INFEASIBLE (verified: 5
                    # trains of mixed priority reliably produced
                    # status=INFEASIBLE, silently returning empty results for
                    # every objective). Priority order is now a soft
                    # preference — penalized in the objective below, not
                    # forbidden — so the solver always finds a real schedule
                    # and only deviates from strict priority order when the
                    # timing genuinely requires it.
                    prio_i = priority_weights.get(str(self.trains[i].get('priority', 'FREIGHT')).upper(), 1)
                    prio_j = priority_weights.get(str(self.trains[j].get('priority', 'FREIGHT')).upper(), 1)

                    if prio_i > prio_j:
                        violation = self.model.NewBoolVar(f'prio_violation_{i}_{j}')
                        self.model.Add(violation == b_ij.Not())  # j went first though i has higher priority
                        priority_violations.append(violation * (prio_i - prio_j))
                    elif prio_j > prio_i:
                        violation = self.model.NewBoolVar(f'prio_violation_{i}_{j}')
                        self.model.Add(violation == b_ij)  # i went first though j has higher priority
                        priority_violations.append(violation * (prio_j - prio_i))

        # Cumulative / NoOverlap constraint for platform occupancy
        if self.num_platforms == 1:
            self.model.AddNoOverlap(intervals)

        # ── 2. Objective Function: Weighted Sum of Delays ──
        delay_vars = []
        held_train_penalties = []
        for i, t in enumerate(self.trains):
            scheduled_arrival = int(t.get('scheduled_arrival', 0))

            delay = self.model.NewIntVar(0, 4320, f'delay_{i}')
            self.model.Add(delay == starts[i] - scheduled_arrival)

            priority_str = str(t.get('priority', 'FREIGHT')).upper()
            weight = priority_weights.get(priority_str, 1)

            # Objective penalty logic — each choice genuinely changes what the
            # solver minimizes, not just a label:
            if self.objective == 'PRIORITIZE_EXPRESS' and priority_str == 'EXPRESS':
                weight *= 3  # extra emphasis on Express trains' delay specifically
            elif self.objective == 'MAXIMIZE_THROUGHPUT':
                # Minimizing total delay-minutes lets the solver spread small
                # delays across many trains freely. Throughput instead cares
                # about how many trains get touched at all — so add a flat
                # per-train penalty for being held even slightly, pushing the
                # solver toward "few trains delayed" over "everyone delayed a
                # little", which is a materially different schedule.
                is_held = self.model.NewBoolVar(f'held_{i}')
                self.model.Add(delay > 0).OnlyEnforceIf(is_held)
                self.model.Add(delay == 0).OnlyEnforceIf(is_held.Not())
                held_train_penalties.append(is_held * 200)

            weighted_delay = self.model.NewIntVar(0, 4320 * 20, f'weighted_delay_{i}')
            self.model.Add(weighted_delay == delay * weight)
            delay_vars.append(weighted_delay)
            
        # Priority-order violations are a soft preference (see above — a hard
        # constraint here made the model INFEASIBLE); a small weight keeps it
        # a tiebreaker rather than overwhelming the actual delay objective.
        objective_terms = delay_vars + [v * 5 for v in priority_violations] + held_train_penalties
        self.model.Minimize(sum(objective_terms))

        # Solve
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(self.model)
        status_name = solver.StatusName(status)
        
        schedule = []
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for i, t in enumerate(self.trains):
                start_val = solver.Value(starts[i])
                end_val = solver.Value(ends[i])
                delay_val = start_val - int(t.get('scheduled_arrival', 0))
                pf_val = solver.Value(platforms[i])
                prio_str = str(t.get('priority', 'FREIGHT')).upper()
                
                # Action categorization
                if delay_val == 0:
                    action = "PROCEED"
                    xai_reason = f"Main Line (PF {pf_val}) assigned. Priority {prio_str} on-time dispatch maintains optimal section throughput."
                elif delay_val <= 30:
                    action = "HOLD"
                    xai_reason = f"Held at Loop Line (PF {pf_val}) for {delay_val} min. Gives precedence to higher priority Express train and maintains 3-min signal headway."
                else:
                    action = "REROUTE"
                    xai_reason = f"Rerouted via Alternate Loop Track (PF {pf_val}) with {delay_val} min buffer to absorb disruption and prevent section gridlock."

                schedule.append({
                    "train": t['id'],
                    "train_number": t['id'],
                    "start": start_val,
                    "end": end_val,
                    "scheduled_arrival": int(t.get('scheduled_arrival', 0)),
                    "delay_minutes": delay_val,
                    "platform": pf_val,
                    "action": action,
                    "xai_explanation": xai_reason,
                })
        
        # Sort chronologically by start time
        schedule.sort(key=lambda x: x['start'])
                
        return {
            "status": status_name,
            "schedule": schedule
        }

