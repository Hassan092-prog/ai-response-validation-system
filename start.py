import subprocess
import sys
import os
import time
import signal
from pathlib import Path

def kill_process_on_port(port):
    try:
        if os.name == 'nt':
            output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
            for line in output.strip().split("\n"):
                parts = line.split()
                if len(parts) >= 5 and f":{port}" in parts[1]:
                    pid = parts[-1]
                    subprocess.call(["taskkill", "/F", "/PID", pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.run(["fuser", "-k", f"{port}/tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def main():
    root_dir = Path(__file__).resolve().parent
    frontend_dir = root_dir / "frontend"
    
    print("Starting AI Response Validation System...")
    
    if not frontend_dir.exists():
        print(f"Error: Frontend directory not found at {frontend_dir}")
        sys.exit(1)

    # Free up port 8005 if a previous server was left running
    kill_process_on_port(8005)
    time.sleep(1)

    processes = []
    
    try:
        print("\n=> Starting Backend (FastAPI on port 8005)...")
        backend_cmd = [sys.executable, "-m", "uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8005", "--reload"]
        backend_process = subprocess.Popen(backend_cmd, cwd=root_dir)
        processes.append(backend_process)
        
        time.sleep(2)
        
        print("\n=> Starting Frontend (Vite on 0.0.0.0)...")
        npm_cmd = "npm run dev -- --host"
        frontend_process = subprocess.Popen(npm_cmd, cwd=frontend_dir, shell=True)
        processes.append(frontend_process)
        
        print("\n=== SYSTEM IS RUNNING ===")
        print("Backend available at:  http://192.168.1.92:8005/docs")
        print("Frontend available at: http://192.168.1.92:5173")
        print("Press Ctrl+C to stop all servers.")
        
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nShutting down servers...")
    finally:
        for p in processes:
            try:
                if os.name == 'nt':
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
            except Exception:
                pass
        print("All servers stopped. Goodbye!")

if __name__ == "__main__":
    main()
