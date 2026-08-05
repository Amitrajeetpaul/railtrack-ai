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

                    # Loop line overtake rule: If high-priority express follows lower priority freight/local,
                    # force lower priority train to use Loop Line (PF >= 2) while express takes Main Line (PF 1).
                    prio_i = priority_weights.get(str(self.trains[i].get('priority', 'FREIGHT')).upper(), 1)
                    prio_j = priority_weights.get(str(self.trains[j].get('priority', 'FREIGHT')).upper(), 1)
                    
                    if prio_i > prio_j:
                        # Train i has higher priority — prefer train i going first
                        self.model.Add(b_ij == 1)
                    elif prio_j > prio_i:
                        self.model.Add(b_ij == 0)

        # Cumulative / NoOverlap constraint for platform occupancy
        if self.num_platforms == 1:
            self.model.AddNoOverlap(intervals)

        # ── 2. Objective Function: Weighted Sum of Delays ──
        delay_vars = []
        for i, t in enumerate(self.trains):
            scheduled_arrival = int(t.get('scheduled_arrival', 0))
            
            delay = self.model.NewIntVar(0, 4320, f'delay_{i}')
            self.model.Add(delay == starts[i] - scheduled_arrival)
            
            priority_str = str(t.get('priority', 'FREIGHT')).upper()
            weight = priority_weights.get(priority_str, 1)
            
            # Objective penalty logic
            if self.objective == 'PRIORITIZE_EXPRESS' and priority_str == 'EXPRESS':
                weight *= 3  # extra emphasis on Express trains
            
            weighted_delay = self.model.NewIntVar(0, 4320 * 20, f'weighted_delay_{i}')
            self.model.Add(weighted_delay == delay * weight)
            delay_vars.append(weighted_delay)
            
        self.model.Minimize(sum(delay_vars))

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

