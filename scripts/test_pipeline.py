"""
test_pipeline.py — 三层 AI 链路一键联调测试脚本

测试顺序：
  Step 1: /api/vision         — YT-VITA 图生文（多模态感知）
  Step 1b: /api/storage/upload — Supabase 公网 URL（与前端一致，供参考图）
  Step 2: /api/image/submit   — HY-Image-V3.0 提交生图任务（有 URL 时带 images）
  Step 3: /api/image/query    — 轮询直到完成，打印图片 URL
  Step 4: /api/video/submit   — HY-Video-1.5 提交生视频（有 URL 时带 images，路由映射为 image.url）
  Step 5: /api/video/query    — 轮询直到完成，打印视频 URL

使用方式：
  1. 确保 next dev 已在 localhost:3000 运行
  2. 确保 .env.local 中 TOKENHUB_API_KEY 已填写
  3. 执行：python scripts/test_pipeline.py [图片路径（可选，默认使用测试图）]
"""

import json
import sys
import time
import urllib.error
import urllib.request
import base64
import os

BASE = "http://localhost:3000"

# 1x1 白色 PNG（测试用最小图）
TINY_PNG_B64 = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
)

POLL_INTERVAL = 3   # 秒
POLL_MAX      = 120  # 最长等待秒数


def post(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def poll_job(path: str, model: str, job_id: str) -> dict:
    """轮询任务状态直到完成或超时。"""
    deadline = time.time() + POLL_MAX
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            res = post(path, {"id": job_id, "model": model})
            data = res.get("data", {})
            status = str(data.get("status", "")).lower()
            print(f"      [轮询 #{attempt}] status={status}")
            if status in ("completed",):
                return res
            if status in ("failed", "error", "canceled", "cancelled"):
                return res
        except urllib.error.HTTPError as e:
            print(f"      [轮询 HTTP 错误] {e.code}: {e.read().decode()[:200]}")
        time.sleep(POLL_INTERVAL)

    return {"success": False, "error": "轮询超时", "last_attempt": attempt}


def load_image(path):
    if path and os.path.isfile(path):
        ext = os.path.splitext(path)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        return f"data:{mime};base64,{b64}"
    print("  [提示] 未指定图片路径，使用内置 1x1 测试图")
    return TINY_PNG_B64


def sep(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print("="*60)


def main() -> int:
    img_path = sys.argv[1] if len(sys.argv) > 1 else None
    image_b64 = load_image(img_path)
    print(f"\n[开始] 图片 base64 长度：{len(image_b64)} 字节")

    # ──────────────────────────────────────────────────────────
    # Step 1: YT-VITA 感知
    # ──────────────────────────────────────────────────────────
    sep("Step 1 — YT-VITA 多模态感知（/api/vision）")
    try:
        vision_res = post("/api/vision", {"imageBase64": image_b64})
        print(json.dumps(vision_res, ensure_ascii=False, indent=2))

        if not vision_res.get("success"):
            print(f"[失败] vision 感知失败：{vision_res.get('error')}")
            print("  → YT-VITA 感知失败不影响后续独立测试，继续用默认 prompt")
            vision_data = None
        else:
            vision_data = vision_res["data"]
            print(f"\n  mainEntity  : {vision_data['mainEntity']}")
            print(f"  sceneState  : {vision_data['sceneState']}")
            print(f"  userEmotion : {vision_data['userEmotion']}")
            if vision_data.get("styleHints"):
                print(f"  styleHints  : {vision_data['styleHints']}")
    except Exception as e:
        print(f"[异常] {e}")
        vision_data = None

    # ──────────────────────────────────────────────────────────
    # Step 1b: Supabase 公网 URL（与页面一致：图生图 / 图生视频带参考图）
    # ──────────────────────────────────────────────────────────
    sep("Step 1b — Supabase 上传（/api/storage/upload）")
    public_url = None
    try:
        upload_res = post("/api/storage/upload", {"imageBase64": image_b64})
        print(json.dumps(upload_res, ensure_ascii=False, indent=2))
        if upload_res.get("success") and upload_res.get("publicUrl"):
            public_url = upload_res["publicUrl"]
            print("\n  [成功] publicUrl 已取得（后续 HY-Image / HY-Video 将附带参考图）")
        else:
            print(f"\n  [提示] 上传未成功：{upload_res.get('error')} — 后续不传 images")
    except Exception as e:
        print(f"[异常] storage upload: {e}")

    # 构造生图 prompt
    if vision_data:
        prompt = (
            f"{vision_data['mainEntity']}。"
            f"{vision_data['sceneState']}。"
            f"情绪：{vision_data['userEmotion']}。"
            f"风格：{vision_data['styleHints'][0] if vision_data.get('styleHints') else '赛博夸张梗图风'}。"
            "极度夸张，幽默，高反差，适合年轻人社交传播。"
        )
    else:
        prompt = "赛博朋克风格的宿舍，极度夸张，霓虹灯光，克苏鲁触手从屏幕中伸出，高反差梗图"

    print(f"\n  [生图 Prompt] {prompt}")

    # ──────────────────────────────────────────────────────────
    # Step 2 & 3: HY-Image-V3.0 图生图
    # ──────────────────────────────────────────────────────────
    sep("Step 2 — HY-Image-V3.0 提交生图（/api/image/submit）")
    image_job_id = None
    try:
        img_payload = {"model": "hy-image-v3.0", "prompt": prompt}
        if public_url:
            img_payload["images"] = [public_url]
        submit_res = post("/api/image/submit", img_payload)
        print(json.dumps(submit_res, ensure_ascii=False, indent=2))

        if submit_res.get("success") and submit_res.get("data", {}).get("id"):
            image_job_id = submit_res["data"]["id"]
            print(f"\n  [成功] 任务 ID：{image_job_id}")
        else:
            print(f"[失败] 提交失败：{submit_res.get('error')}")
    except Exception as e:
        print(f"[异常] {e}")

    if image_job_id:
        sep(f"Step 3 — 轮询 HY-Image 任务（/api/image/query）ID={image_job_id}")
        poll_res = poll_job("/api/image/query", "hy-image-v3.0", image_job_id)
        print(json.dumps(poll_res, ensure_ascii=False, indent=2))

        if poll_res.get("success"):
            data = poll_res.get("data", {})
            img_list = data.get("data") or []
            if img_list:
                print(f"\n  [生图结果 URL] {img_list[0].get('url', '(无 URL)')}")
            else:
                print(f"  [状态] {data.get('status')} — 暂无图片数据")
    else:
        print("\n  [跳过] 无任务 ID，跳过 image/query")

    # ──────────────────────────────────────────────────────────
    # Step 4 & 5: HY-Video-1.5 图生视频
    # ──────────────────────────────────────────────────────────
    sep("Step 4 — HY-Video-1.5 提交生视频（/api/video/submit）")
    video_job_id = None
    try:
        vid_payload = {"model": "hy-video-1.5", "prompt": prompt}
        if public_url:
            vid_payload["images"] = [public_url]
        video_submit_res = post("/api/video/submit", vid_payload)
        print(json.dumps(video_submit_res, ensure_ascii=False, indent=2))

        if video_submit_res.get("success") and video_submit_res.get("data", {}).get("id"):
            video_job_id = video_submit_res["data"]["id"]
            print(f"\n  [成功] 任务 ID：{video_job_id}")
        else:
            print(f"[失败] 提交失败：{video_submit_res.get('error')}")
    except Exception as e:
        print(f"[异常] {e}")

    if video_job_id:
        sep(f"Step 5 — 轮询 HY-Video 任务（/api/video/query）ID={video_job_id}")
        video_poll = poll_job("/api/video/query", "hy-video-1.5", video_job_id)
        print(json.dumps(video_poll, ensure_ascii=False, indent=2))

        if video_poll.get("success"):
            data = video_poll.get("data", {})
            vid_data = data.get("data")
            if isinstance(vid_data, dict):
                url = vid_data.get("url", "(无 URL)")
            elif isinstance(vid_data, list) and vid_data:
                url = vid_data[0].get("url", "(无 URL)")
            else:
                url = None
            if url:
                print(f"\n  [生视频结果 URL] {url}")
            else:
                print(f"  [状态] {data.get('status')} -- 暂无视频数据")
    else:
        print("\n  [跳过] 无任务 ID，跳过 video/query")

    sep("测试完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
