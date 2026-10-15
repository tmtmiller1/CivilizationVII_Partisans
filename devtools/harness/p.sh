#!/bin/zsh
# p.sh <step> [args-json] [max-seconds]: run one PTL step in the lab game and print its result.
# Loads pt-lab.js into the page first when it is missing (a UI reload wipes it).
H=${0:A:h}; B="$H/../../../../tools/tower-bench/tower-bench.mjs"
STEP=$1; ARGS=${2:-'{}'}; MAX=${3:-120}
LAB=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.tower-bench/runs/current.json')))['pid'])" 2>/dev/null)
NOW=$(pgrep -x CivilizationVII)
[[ -n $LAB && $LAB == $NOW ]] || { echo "p.sh: game pid '$NOW' is not the lab's '$LAB'; stopping" >&2; exit 1; }
R=$(node "$B" eval "typeof globalThis.PTL === 'object' ? 'ok' : 'missing'" 2>&1)
[[ $R == *ok* ]] || node "$B" eval "$(cat $H/pt-lab.js)" >/dev/null
node "$B" eval "PTL.start('$STEP', $ARGS)" >/dev/null
for k in $(seq 1 $((MAX / 2))); do
  sleep 2
  R=$(node "$B" eval "PTL.read('$STEP')" 2>&1)
  [[ $R == *'"done":true'* ]] && { echo "$R"; exit 0; }
done
echo "p.sh: $STEP still running after ${MAX}s: $R"; exit 2
