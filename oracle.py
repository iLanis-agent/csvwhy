import csv, io, json, sys
cases = json.load(sys.stdin)
out = []
for c in cases:
    try:
        rows = list(csv.reader(io.StringIO(c['text'], newline=''), delimiter=c['d']))
    except Exception as e:
        rows = 'ERR ' + str(e)
    out.append(rows)
json.dump(out, sys.stdout)
