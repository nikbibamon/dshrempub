"""Plan positive-duration tasks by priority, stable input order, in earliest fitting slot.
Slots are sorted and non-overlapping; durations are 1..480 minutes.
Zero duration is unspecified: ordering and placement are not defined for it.
"""
def plan_day(tasks, slots):
    cursors = [start for start, end in slots]
    result = []
    for task in sorted(tasks, key=lambda t: -t['priority']):
        if task['minutes'] == 0:
            continue
        for i, (start, end) in enumerate(slots):
            if cursors[i] < end:
                result.append((task['id'], cursors[i]))
                cursors[i] += task['minutes']
                break
    return result
