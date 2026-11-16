import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from planner import plan_day
class EdgeTests(unittest.TestCase):
    def test_overflow(self):
        tasks=[dict(id='a',priority=2,minutes=70),dict(id='b',priority=1,minutes=50)]
        self.assertEqual(plan_day(tasks, [(0,100)]), [('a',0)])
