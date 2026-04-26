"""
query_video.py — 单独轮询 HY-Video 任务（供长时间任务手动查询）

用法：
  python scripts/query_video.py <job_id>
"""
import json, sys, time, urllib.request, urllib.error

BASE = "http://localhost:3000"
POLL_INTERVAL = 5   # 秒
POLL_MAX = 600       # 最多等 10 分钟


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    if len(sys.argv) < 2:
        print("用法：python scripts/query_video.py <job_id>")
        return 1

    job_id = sys.argv[1].strip()
    print(f"[轮询] HY-Video-1.5 任务 ID：{job_id}")
    deadline = time.time() + POLL_MAX
    attempt = 0

    while time.time() < deadline:
        attempt += 1
        try:
            res = post("/api/video/query", {"id": job_id, "model": "hy-video-1.5"})
            data = res.get("data", {})
            status = str(data.get("status", "")).lower()
            print(f"  #{attempt:03d} status={status}")

            if status == "completed":
                # HY-Video data 字段可能是 dict（单条）也可能是 list
                vid_data = data.get("data")
                if isinstance(vid_data, dict):
                    url = vid_data.get("url", "(无 URL)")
                elif isinstance(vid_data, list) and vid_data:
                    url = vid_data[0].get("url", "(无 URL)")
                else:
                    url = "(无数据)"
                print("\n[完成] 视频生成完毕！")
                print(f"  URL: {url}")
                print(json.dumps(res, ensure_ascii=False, indent=2))
                return 0

            if status in ("failed", "error", "canceled", "cancelled"):
                print(f"\n[失败] 任务失败，状态：{status}")
                print(json.dumps(res, ensure_ascii=False, indent=2))
                return 2

        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code}: {e.read().decode()[:200]}")
        except Exception as e:
            print(f"  异常: {e}")

        time.sleep(POLL_INTERVAL)

    print(f"\n[超时] 轮询 {POLL_MAX}s 超时，视频仍在生成中，可稍后再次运行本脚本查询")
    return 3


if __name__ == "__main__":
    sys.exit(main())
