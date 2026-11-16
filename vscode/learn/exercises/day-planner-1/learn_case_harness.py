"""Pinned author code. The learner supplies JSON data only, never code."""
import importlib.util, json, sys
from reference_planner import plan_day as reference

def pairs(value):
    return sorted((str(row[0]), int(row[1])) for row in value)

def main():
    case = json.loads(sys.argv[2])
    tasks, slots, expected = case['tasks'], case['slots'], case['expected']
    if pairs(reference(tasks, slots)) != pairs(expected):
        return 2
    spec = importlib.util.spec_from_file_location('candidate_planner', sys.argv[1])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return 0 if pairs(module.plan_day(tasks, slots)) == pairs(expected) else 1

if __name__ == '__main__':
    sys.exit(main())
