import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from planner import plan_day
class PlannerTests(unittest.TestCase):
    def test_priority_and_stability(self):
        tasks = [dict(id='a', priority=1, minutes=20), dict(id='b', priority=2, minutes=30), dict(id='c', priority=1, minutes=10)]
        self.assertEqual(plan_day(tasks, [(0,100)]), [('b',0), ('a',30), ('c',50)])
    def test_gap_between_slots(self):
        self.assertEqual(plan_day([dict(id='a',priority=1,minutes=30)], [(0,20),(40,100)]), [('a',40)])
