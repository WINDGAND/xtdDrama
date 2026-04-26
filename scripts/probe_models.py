import json
import sys
import urllib.request
import urllib.error


BASE = "http://localhost:3000"

# 尽可能覆盖常见命名：文本模型 + 多模态模型
MODEL_CANDIDATES = [
    # 来自 TokenHub 官方文档（API 使用说明，2026-04-23）
    "hy3-preview",
    "hunyuan-2.0-thinking-20251109",
    "hunyuan-2.0-instruct-20251111",
    "hunyuan-role-latest",
    "deepseek-v3.2",
    "deepseek-v3.1-terminus",
    "deepseek-r1-0528",
    "deepseek-v3-0324",
    "glm-5.1",
    "glm-5-turbo",
    "glm-5",
    "kimi-k2.6",
    "kimi-k2.5",
    "minimax-m2.7",
    "minimax-m2.5",

    # 生成类（不一定支持 chat/completions，但仍尝试 vision）
    "HY-Image-V3.0",
    "HY-Image-Lite",
]

# 1x1 PNG，仅用于探测多模态接口是否接受 image_url
TEST_IMAGE = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X+Z1UAAAAASUVORK5CYII="
)


def post(path: str, obj: dict) -> dict:
    data = json.dumps(obj).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    ok = []
    print("--- validate models (chat ping) ---")
    for m in MODEL_CANDIDATES:
        try:
            res = post("/api/tokenhub/validate-model", {"model": m})
            if res.get("success") is True:
                print("OK ", m)
                ok.append(m)
            else:
                print("NO ", m)
        except urllib.error.HTTPError as e:
            print("ERR", m, "http", e.code)
        except Exception as e:
            print("ERR", m, e)

    if not ok:
        print("No chat model validated. Check TOKENHUB_API_KEY and dev server.")
        return 2

    print("--- test vision (image_url) ---")
    for m in ok:
        try:
            res = post(
                "/api/vision",
                {"model": m, "imageBase64": TEST_IMAGE, "userNote": "测试：只输出JSON"},
            )
            if res.get("success") is True:
                print("VISION OK:", m)
                print(json.dumps(res, ensure_ascii=False))
                return 0
            else:
                print("VISION NO:", m, "code=", res.get("code"), "err=", res.get("error"))
        except urllib.error.HTTPError as e:
            print("VISION ERR:", m, "http", e.code)
        except Exception as e:
            print("VISION ERR:", m, e)

    print("No model worked for vision yet (needs multimodal model name from TokenHub).")
    return 3


if __name__ == "__main__":
    sys.exit(main())

