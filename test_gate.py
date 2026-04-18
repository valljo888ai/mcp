import subprocess, json, sys, os

proc = subprocess.Popen(
    ["node", "dist/cli.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    cwd="c:/Users/admin/Desktop/Claude/Development/slam-mcp",
    env={**os.environ, "SLAM_DB_PATH": "c:/Users/admin/Desktop/Claude/Development/SLAM Gadget/slam/docs/slam-slam-dev-store.db"}
)

def send(msg):
    line = json.dumps(msg) + "\n"
    proc.stdin.write(line.encode())
    proc.stdin.flush()
    return json.loads(proc.stdout.readline())

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}})
proc.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n')
proc.stdin.flush()

# Call a non-health tool WITHOUT calling slam_health first
result = send({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"slam_products_list","arguments":{}}})
text = result["result"]["content"][0]["text"]
data = json.loads(text)
print("Gate test:", data)
assert data.get("session_token_required") == True, "GATE NOT ENFORCED"
print("GATE ENFORCED OK")
proc.terminate()
