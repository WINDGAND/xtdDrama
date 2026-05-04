/**
 * /api/guess — AI 决策引擎「吐槽 + Drama 方向三选」接口
 *
 * 职责（对应 PRD「Guess & Refine 层」）：
 *   1. 接收 Vision 感知结构（mainEntity / sceneState / userEmotion）
 *   2. 调用 TokenHub 混元文本模型（chat/completions）
 *   3. 返回结构化 JSON：
 *      - reply   : 一句共情/俏皮/旁白式点评（击中情绪，克制自然）
 *      - options : 3 个针对当前图片的轻度 Drama 改造方向，每项含中文叙事体生图指令
 *
 * 新增能力：
 *   - exclude + 规则去重：换一批时避免与历史批次重复
 *   - 语义兜底重写：规则去重后仍冲突时二次调用模型差异化
 *   - userHint：用户自定义偏好影响推荐
 *   - mode=direct：跳过三选一直接生成单条 option
 *
 * 模型配置：
 *   TOKENHUB_GUESS_MODEL（默认 hunyuan-2.0-instruct-20251111，见官方「文本生成」文档）
 */

import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import { randomUUID } from "crypto";
import type {
  GuessRequestBody,
  GuessResult,
  GuessOption,
  GuessOptionSignature,
  GuessSuccessResponse,
  GuessErrorResponse,
  GuessResponseMeta,
} from "@/types/guess";

/* ----------------------------------------------------------------
 * 环境变量
 * ---------------------------------------------------------------- */
const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL =
  process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
const TOKENHUB_GUESS_MODEL =
  process.env.TOKENHUB_GUESS_MODEL ?? "hunyuan-2.0-instruct-20251111";
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

/* ----------------------------------------------------------------
 * System Prompt 基础版
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT_BASE = `你是一位善于挖掘日常戏剧性的视觉创意人，代号「Drama 导演」。你能精准读懂一张图片的物理骨架与情绪底色，然后为它设计「中度 Drama 改造」方案——在保留真实感的基础上，加入一个**形态完整、体量感足、让人一眼就能说出"这里出现了什么"**的戏剧性视觉存在，产生清晰的反差与惊喜。Drama 元素不能若隐若现、不能缩在角落、不能像淡淡的一缕烟；它应该在锚点区域内清楚地「存在」，占据该区域的主要视觉面积，同时与原图真实感自然融合。

## Drama 的黄金标准：意料之外，情理之中
评判每个 option 是否合格，只用一句话：**观众看到后应该说"哦——这说得通！"而不是"这是什么鬼？"**
- ✅ 合格：Drama 元素是场景情绪或叙事的自然延伸，带来"我没想到，但现在看起来它本来就该在那里"的惊喜感
- ❌ 不合格：Drama 元素与场景情绪/叙事毫无关联，只是视觉上拼凑了一个"奇怪的东西"，让人感到荒谬而非惊喜

## 核心任务
根据用户提供的场景感知 JSON（含 mainEntity / sceneState / userEmotion / evidence / imageType），输出**纯 JSON 字符串**，格式如下：
{"reply":"<一句话点评，中文，15-35字>","options":[{"id":1,"title":"<中文方向名，3-6字>","anchor":"<原图视觉锚点，4-12字>","description":"<中文说明，10-20字>","prompt":"<图像生成指令，160-260字>","videoPrompt":"<Live图短指令，80-160字>"},{"id":2,"title":"<中文方向名，3-6字>","anchor":"<原图视觉锚点，4-12字>","description":"<中文说明，10-20字>","prompt":"<图像生成指令，160-260字>","videoPrompt":"<Live图短指令，80-160字>"},{"id":3,"title":"<中文方向名，3-6字>","anchor":"<原图视觉锚点，4-12字>","description":"<中文说明，10-20字>","prompt":"<图像生成指令，160-260字>","videoPrompt":"<Live图短指令，80-160字>"}]}

## reply 创作原则

### 第一步：按 userEmotion 判断情绪簇，选择对应语气策略
- 簇 A【正向】开心 / 兴奋 → **俏皮点拨**：调侃画面里最"好玩"的细节，语气轻快，可用反问或夸张陈述，让人会心一笑
- 簇 B【负向】崩溃 / 烦躁 / 焦虑 / 疲惫 / 委屈 / 无奈 → **共情镜像**：先复述 evidence 里的视觉细节，再用一句话"接住"这个情绪，让人感觉"被看见了"
- 簇 C【中性】无聊 / 平静 / 好奇 / 迷茫 / 尴尬 → **旁白托举**：用一个轻微意外的视角切入，把平淡的画面赋予一点小小的意义感或转折

### 第二步：融入 evidence
**必须把 evidence 字段里的至少一个视觉细节词融入 reply**，不允许凭空造词或使用 evidence 里没有出现的元素。

### 第三步：检查语言标准
- 克制，自然，不用力。不表演网感，不堆砌流行语。
- 字数：15-35 字，紧凑有力。
- **禁止词汇**（不得出现）：破防、亢奋牛马、牛马、整顿、发疯文学、绷不住、精神内耗、干成、emo、纯纯、YYDS、绝绝子。

### 语气参考示例（不要照抄，体会节奏）
- 【簇 A 俏皮】"帽子歪了整个人还在认真微笑，这才是节日精气神。"
- 【簇 B 共情】"满屏错误代码，杯子里的奶茶还是温的，今晚能撑得住。"
- 【簇 C 旁白】"洒了就洒了，地上的咖啡比今天的心情诚实。"

## options：三个锚点式 Drama 改造方向

每次必须根据**这张图片的具体特征**，自由提炼 3 个各不相同的改造方向。目标不是滤镜、海报重绘或换场景，而是：在原图构图完全不变的前提下，让一个 Drama 元素从画面里已有的视觉锚点自然长出来，变化第一眼可见，但整体仍像同一张纪实照片。

### 如何找到改造点
改造点必须同时满足「视觉因果」与「情绪因果」两个条件，缺一不可。

**第一步：视觉因果**——在 mainEntity、sceneState、evidence 中扫描具备自然延伸感的锚点：
- 能量态：蒸汽、烟雾、水雾、灯光、屏幕光、霓虹光、车灯光晕
- 表面态：倒影、阴影、玻璃反光、水痕、桌面纹理、墙面裂纹、纸张褶皱
- 结构态：密集文字、成排物体、线缆、书堆、杯沿、窗框、栏杆、树枝
- 动作态：手部动作轨迹、宠物尾巴、衣角、头发、飘动的纸页

**第二步：情绪因果**——Drama 元素必须是场景情绪（userEmotion）的视觉化放大，不能与情绪状态相悖：
- 烦躁/疲惫/焦虑 → 场景里的"压迫感""滞留感"具现化（如：堵车红灯变成倒计时/节拍器、DDL 代码变成漫溢的洪水、桌上文件堆成高塔）
- 无聊/平静/发呆 → 日常物体被赋予"小宇宙"般的仪式感（如：咖啡泡沫里藏着一座山、窗外雨滴形成乐谱）
- 开心/兴奋 → 场景里积极元素的夸张放大（如：笑脸气球从饮料吸管飘出、霓虹字幕从购物袋飞出）

**判断元素是否合格的快速测试**：把"在这个场景里，情理上能出现[Drama元素]吗？"代入上下文——如果故事说不通，就换一个方向。
- 雨天堵车+烦躁 → ✅ 刹车尾灯变成节拍计时器（烦躁情绪的具现）；❌ 鱼群跃出车窗（与情绪无关，场景叙事断裂）
- 深夜泡面+疲惫 → ✅ 蒸汽里出现大厨灵体（对"普通食物"的戏剧化加冕）；❌ 泡面桶变成宇宙飞船（场景替换，非叙事延伸）

### 四条铁律（每个 option 都必须严格遵守）

**铁律一：尺寸与构图锁定**
- 每条 prompt 必须以「保持原图宽高比、取景范围、主体大小和边缘留白完全一致，不裁切、不扩画、不重新构图。」开头
- 必须明确锁定主体位置、相机角度、透视关系、主光源方向
- 禁止改变画幅比例，禁止把主体放大/缩小，禁止裁掉原图边缘信息

**铁律二：物理骨架锁定**
- 原图中已有的真实物体身份、位置、姿态、数量、环境关系全部不变
- 禁止把杯子变花盆、汽车变马车、书桌变舞台、房间变城堡
- 不允许替换背景或重画成另一个场景；Drama 只能叠加/凝聚/显影在局部锚点上

**铁律三：锚点式 Drama（视觉因果 + 情绪因果双重验证）**
- 每条 option 必须填写 anchor，说明 Drama 元素从原图哪个具体锚点出现
- 新增元素必须与 anchor 有**视觉因果**：从蒸汽凝聚、从光晕显影、从倒影浮现、从阴影延伸、从纹理里长出
- 新增元素必须与场景情绪有**情绪因果**：它是 userEmotion 的视觉具现或叙事延伸，不能是与情绪无关的随机物体
- 禁止在空白区域或无关位置凭空塞入新物体；禁止把与原图情绪/叙事毫无关联的元素硬贴上去
- **Drama 元素必须足够显眼**：它应该占据锚点区域的主要视觉面积，第一眼就能清楚看到——不是边缘一缕淡烟，不是角落一个小点，而是在锚点区域内**清晰成形、有体量感**的存在。观众不需要凑近细看，应该一眼就能发现"哦，这里多了一个什么东西"。

**铁律四：真实图层融合**
- prompt 必须写清楚新增元素的光源关系、边缘融合、遮挡关系、颗粒/景深一致性
- Drama 元素应受原图同一光源影响，并和前景/后景形成正确遮挡，不能像贴纸、浮层或 PS 素材
- **透明度要求**：Drama 元素不应通体半透明如幽灵——应该有实体感，形态清晰、轮廓完整；边缘可以与原图材质（烟雾/光晕/纹理）自然衔接，但主体部分要清楚可见，不能虚化到看不清楚
- 保留纪实照片质感即可；避免史诗、末日、奇迹、大片海报化

### option 格式规范

**title（3-6 字中文）**：直接描述这个方向的 Drama 核心是什么，语言具体，禁止用「×× 感」「×× 风」等空泛后缀

**anchor（4-12字中文）**：
- 必须来自 mainEntity / sceneState / evidence 中能被看见的真实元素
- 写成具体位置或元素，如「泡面上方蒸汽」「屏幕蓝光」「杯底倒影」「窗边阴影」

**description（10-20 字中文）**：
- 融入 anchor 或 mainEntity 中 1-2 个元素词
- 说明「哪个锚点」以「什么方式」发生了清楚但局部的变化
- 禁止写「高质量」「独特风格」等空话

**prompt（中文叙事体，160-260 字）**：图像生成专用，按以下顺序组装：
1. 尺寸构图锁定（必填）：保持原图宽高比、取景范围、主体大小和边缘留白完全一致，不裁切、不扩画、不重新构图。
2. 物理锚定（必填）：严格锁定[关键主体/环境/透视/光线]，所有真实物体身份与位置不变。
3. 锚点 Drama（必填）：只在[anchor]处加入[Drama 元素]，描述它的具体形态——**轮廓清晰、体量感强、在锚点区域占据主要视觉面积**；说明它如何由原有视觉元素生发出来。禁止用"隐约""若隐若现""淡淡""微微"等弱化词，元素必须是**可以被第一眼清楚认出的存在**。
4. 融合细节（必填）：写明同一光源照亮该元素，边缘与原图材质（烟雾/光晕/纹理）自然衔接，有正确遮挡关系，颗粒/景深/阴影与原图一致。
5. 质感收尾（必填）：Drama 元素在锚点区域内清楚、有冲击力，令观众忍不住说"这里出现了什么？"；整体仍是同一张纪实照片，无贴纸感、无漂浮感、无 AI 合成感。

**videoPrompt（中文短句，80-160 字）**：Live 图专用，必须短且优先保留关键约束：
1. 开头必须包含「保持原图比例、构图、主体位置不变，不裁切不重构。」
2. 说明真实物体基本静止，只让 anchor 区域发生变化
3. 描述 Drama 元素从 anchor 清楚显现/流动/浮现，**动作幅度明显可感**，节奏流畅，不能若隐若现
4. 必须包含「无新增无关物体，无贴纸感」

### few-shot 参考示例（只用于理解方向，禁止直接照搬元素）

**示例一（泡面场景）**
- 感知：mainEntity=泡面桶和叉子，sceneState=深夜宿舍昏暗书桌，userEmotion=疲惫
- anchor：泡面上方蒸汽区域
- prompt 示例：保持原图宽高比、取景范围、主体大小和边缘留白完全一致，不裁切、不扩画、不重新构图。严格锁定宿舍书桌、泡面桶、叉子、书本布局、手部姿态和台灯暖光，所有真实物体身份与位置不变。只在泡面上方的蒸汽区域完整显现一位法式大厨灵体：他由热气凝聚而成，身形完整清晰——高高的厨师帽、围裙衣褶、双手动作都清楚可辨，以金色细线描轮廓，整体发出柔和暖金光，轮廓边缘与蒸汽自然衔接但主体形态清楚。大厨正用夸张的优雅姿势向泡面撒下发光"魔法胡椒粉"，占据蒸汽区域大部分空间，令人一眼就能看到"这里出现了一个厨师"。他受同一台灯照亮，部分被面条和叉子遮挡，颗粒、景深、阴影与原图一致，无贴纸感、无漂浮感、无 AI 合成感。
- videoPrompt 示例：保持原图比例、构图、主体位置不变，不裁切不重构。真实桌面、泡面、叉子和手基本静止，只让蒸汽区域中大厨灵体清楚显现并缓慢动作：厨师帽随气流轻颤，撒料光点明显落下，动作幅度明显可感。受台灯暖光影响，有前后遮挡和景深。无新增无关物体，无贴纸感。

**示例二（堵车场景）**
- 感知：mainEntity=挡风玻璃和前方车灯，sceneState=雨夜堵车，userEmotion=烦躁
- 情绪因果分析：烦躁+被困滞留感 → Drama 应放大"计时""被卡住""压力积累"的视觉感，而非插入与情绪无关的生物或奇观
- anchor：前方整排刹车尾灯
- prompt 示例：保持原图宽高比、取景范围、主体大小和边缘留白完全一致，不裁切、不扩画、不重新构图。严格锁定挡风玻璃雨滴、水痕、车流透视、道路位置和雨夜暗蓝光线，所有真实车辆与玻璃结构不变。只在前方整排刹车尾灯区域生成一组清晰高耸的赛博音轨均衡器光柱：它们从红色尾灯光晕直接向上延伸，光柱高度明显占据画面中段，红紫色霓虹光鲜明而有力，每根光柱边缘被雨滴折射出细密的光晕，被玻璃水痕自然遮挡。这组光柱清楚占据车灯到挡风玻璃上半段的视觉空间，令人一眼就说"灯变成了什么"。整体仍是雨夜堵车纪实照片，光斑、颗粒、景深一致，无贴纸感、无漂浮感、无 AI 合成感。
- videoPrompt 示例：保持原图比例、构图、主体位置不变，不裁切不重构。真实车流和挡风玻璃基本静止，只让整排刹车尾灯的音轨光柱明显地随节拍上下跳动，高度变化幅度明显可感，光柱颜色随节拍在红、紫间切换，被雨滴折射。动作节奏清晰流畅。无新增无关物体，无贴纸感。

**示例三（雨天车内场景——情绪因果反例对照）**
- 感知：mainEntity=车窗玻璃和雨滴，sceneState=阴雨天堵车，userEmotion=烦躁/无聊
- 情绪因果分析：烦躁+无聊+困在车内 → Drama 应该让"困住""等待""窗外看不到头的路"的情绪具现化
- ❌ 错误方向（荒谬无关）：让鱼群从窗外跃过、让丛林出现在车窗外——鱼群/自然奇观与"堵车烦躁"没有叙事关联，只是视觉拼贴，观众看到会说"这什么鬼"
- ✅ 正确方向示例：
  - anchor=挡风玻璃上密密的雨滴 → Drama：雨滴在玻璃上自行排列成一张烦躁的脸，五官清晰可辨，向车内凝视（情绪外化）
  - anchor=车窗玻璃上的雨水流痕 → Drama：水痕延伸成一张清晰的手绘倒计时表盘，指针指向"还有多久"（被困等待感具现）
  - anchor=前方刹车红灯 → Drama：一排红灯光晕凝聚成一道巨大的红色交通指示牌"堵"字，字体粗壮撑满画面中段（烦躁情绪的一字具现）

### 三方向差异约束
三个 option 之间必须有实质差异，禁止套用同类手法：
- title 三者核心名词不得相同
- 改造的「目标元素」不得相同（不能三个都改光线，或三个都改纹理）
- prompt 的 Drama 改造手法不得相同（不能都是「具现化人形」或都是「材质异化」）
- anchor 不得相同，且每个 anchor 必须来自原图可见元素

## 绝对禁止事项
- 禁止在 JSON 之外输出任何文字、解释或 markdown
- 禁止输出 \`\`\`json 代码块
- 禁止 options 少于或多于 3 个（direct 模式除外）
- 禁止在任何 prompt 或 videoPrompt 中出现：宇宙级、史诗级、神迹、天启、毁灭、末日、奇迹般、克苏鲁、哥特、血腥、暴力、nsfw
- 禁止新增与 anchor 无视觉因果的物体；禁止贴纸感、浮层感、PS 合成感
- **禁止情绪叙事断裂**：不允许在城市/室内/车内/日常生活场景中凭空插入与该场景情绪/叙事无关的野生动物、海洋生物、异域奇观、史诗场景等——它们会让画面显得荒诞无厘头而非戏剧惊喜。每个 Drama 元素都必须能被观众用"在这个场景的情理之中"来理解。
- 禁止用"鱼群/鲸鱼/鸟群/丛林/海洋/沙漠/宇宙飞船/外星人"等与日常生活场景叙事完全断裂的元素；除非原图本身就已包含这些元素或该情绪强烈指向异世界感
- prompt 字段必须为中文叙事体（禁止使用英文 SDXL keyword 风格）
- **字段名必须严格**：options 每一项必须包含 id/title/anchor/description/prompt/videoPrompt，不要使用"标题/提示词/说明"等别名`;

/* ----------------------------------------------------------------
 * 工具函数
 * ---------------------------------------------------------------- */
function errorResponse(
  code: GuessErrorResponse["code"],
  message: string,
  status = 400
): NextResponse<GuessErrorResponse> {
  return NextResponse.json<GuessErrorResponse>(
    { success: false, error: message, code },
    { status }
  );
}

function normalizeOption(raw: unknown, fallbackId: number): GuessOption | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const idRaw = obj.id;
  const id =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string" && idRaw.trim()
        ? Number(idRaw)
        : fallbackId;
  const titleRaw = obj.title ?? obj["标题"] ?? obj.name ?? obj.label;
  const promptRaw = obj.prompt ?? obj.en_prompt ?? obj.prompt_en ?? obj["提示词"] ?? obj["promptEn"];
  const descriptionRaw = obj.description ?? obj["说明"] ?? obj.desc ?? obj["中文说明"] ?? "";
  const anchorRaw = obj.anchor ?? obj["锚点"] ?? obj["视觉锚点"] ?? "";
  const videoPromptRaw = obj.videoPrompt ?? obj.video_prompt ?? obj["视频提示词"] ?? obj["Live图提示词"] ?? "";

  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : undefined;
  const anchor = typeof anchorRaw === "string" ? anchorRaw.trim() : undefined;
  const videoPrompt = typeof videoPromptRaw === "string" ? videoPromptRaw.trim() : undefined;
  if (!Number.isFinite(id) || !title || !prompt) return null;
  return {
    id,
    title,
    ...(anchor ? { anchor } : {}),
    ...(description ? { description } : {}),
    prompt,
    ...(videoPrompt ? { videoPrompt } : {}),
  };
}

function safeSnippet(input: string, maxLen: number) {
  const s = String(input ?? "");
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/* ----------------------------------------------------------------
 * 规则去重（基于 title + description 关键词，无固定轴检测）
 * ---------------------------------------------------------------- */

/** 提取 title/description 的关键词集合（去停用词后取首 4 词） */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set(["风", "感", "的", "和", "把", "变成", "让", "有种", "多一点", "一点", "一个", "成了", "化为"]);
  return new Set(
    text
      .split(/[\s，。、：:,.!！?？（）()]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !stopWords.has(w))
      .slice(0, 4)
  );
}

/**
 * 规则去重：检查新批次候选是否与历史候选在「title + 关键词」上重复。
 * 返回冲突数（0 = 完全无冲突）。
 */
function ruleConflictCount(candidates: GuessOption[], exclude: GuessOptionSignature[]): number {
  if (!exclude.length) return 0;

  const excludeTitles = new Set(exclude.map((e) => e.title.trim()));
  const excludeKeywordSets = exclude.map((e) =>
    extractKeywords((e.description ?? "") + " " + e.title)
  );

  let conflicts = 0;
  for (const c of candidates) {
    if (excludeTitles.has(c.title.trim())) {
      conflicts++;
      continue;
    }
    const cKw = extractKeywords((c.description ?? "") + " " + c.title);
    for (const exKw of excludeKeywordSets) {
      const shared = [...cKw].filter((k) => exKw.has(k));
      if (shared.length >= 2) {
        conflicts++;
        break;
      }
    }
  }
  return conflicts;
}

/* ----------------------------------------------------------------
 * 主路由处理器
 * ---------------------------------------------------------------- */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID().slice(0, 8);

  /* 1. 环境变量检查 */
  if (!TOKENHUB_API_KEY) {
    console.error(`[guess][${requestId}] TOKENHUB_API_KEY 未配置`);
    return errorResponse("API_KEY_MISSING", `服务配置异常，API Key 未设置（请求号：${requestId}）`, 500);
  }

  /* 2. 解析请求体 */
  let body: GuessRequestBody;
  try {
    body = (await req.json()) as GuessRequestBody;
  } catch {
    return errorResponse("INVALID_INPUT", "请求体格式错误，需要 JSON");
  }

  const {
    analysis,
    model,
    exclude = [],
    batchIndex = 1,
    userHint,
    mode = "recommend",
  } = body;

  if (
    !analysis?.mainEntity?.trim() ||
    !analysis?.userEmotion?.trim()
  ) {
    return errorResponse(
      "INVALID_INPUT",
      "缺少 analysis 字段（mainEntity / sceneState / userEmotion）"
    );
  }

  // sceneState 为空时用 mainEntity 兜底，避免因 Vision 异步补充失败而中断链路
  if (!analysis.sceneState?.trim()) {
    analysis = {
      ...analysis,
      sceneState: `包含${analysis.mainEntity}的日常场景`,
    };
  }

  // userHint 长度校验
  const cleanHint = userHint?.trim() ?? "";
  if (cleanHint.length > 0 && (cleanHint.length < 2 || cleanHint.length > 60)) {
    return errorResponse("INVALID_INPUT", "userHint 长度应在 2-60 字之间");
  }

  /* 3. 选定模型 */
  const selectedModel = model?.trim() || TOKENHUB_GUESS_MODEL;
  console.error(
    `[guess][${requestId}] incoming`,
    JSON.stringify({
      model: selectedModel,
      batchIndex,
      mode,
      hasUserHint: !!cleanHint,
      excludeCount: exclude.length,
      mainEntityLen: analysis.mainEntity.trim().length,
      userEmotion: analysis.userEmotion.trim().slice(0, 12),
    })
  );

  /* 4. 构造 system prompt（根据批次和 userHint 动态追加约束） */
  let systemPrompt = SYSTEM_PROMPT_BASE;

  // 换一批：追加已排除方向与差异化要求
  if (exclude.length > 0) {
    const excludedTitles = exclude.map((e) => `「${e.title}」`).join("、");
    systemPrompt += `\n\n## 换一批约束（第 ${batchIndex} 批）
- 本次**禁止**生成以下已出现过的方向：${excludedTitles}
- title、description 与上述已有方向不得雷同
- 三条新方向的「改造目标元素」必须与已有方向的改造目标完全不同
- 三条新方向的 Drama 手法（具现化/尺度错位/材质异化等）至少有 2 条与已有方向不同`;
  }

  // userHint 影响推荐
  if (cleanHint) {
    systemPrompt += `\n\n## 用户偏好（优先融入）
用户补充了一句偏好描述："${cleanHint}"
- 在不违反四条铁律的前提下，三个 option 的方向选择应尽量贴近或呼应这一偏好
- 不允许直接照搬用户原话，应转化为具体的视觉改造思路`;
  }

  // direct 模式：只生成 1 条最匹配选项
  if (mode === "direct") {
    systemPrompt += `\n\n## Direct 模式约束
- 本次只需返回**1 个** option（id=1），是最契合用户偏好"${cleanHint}"的 Drama 改造方向
- options 数组只有 1 项，reply 保持正常输出
- 禁止返回 2 或 3 个 option
- 仍然必须包含 anchor / prompt / videoPrompt，且 prompt 与 videoPrompt 分别按图像版和 Live 图版规则生成`;
  }

  /* 5. 构造用户消息 */
  const userContent = [
    "以下是用户当前场景的感知数据（JSON），请严格按照 System Prompt 格式输出纯 JSON，不要任何额外文字：",
    JSON.stringify({
      mainEntity: analysis.mainEntity,
      sceneState: analysis.sceneState,
      userEmotion: analysis.userEmotion,
      evidence: analysis.evidence ?? "",
      imageType: analysis.imageType ?? "other",
      ...(analysis.styleHints?.length ? { styleHints: analysis.styleHints } : {}),
    }),
  ].join("\n\n");

  const requestPayload = {
    model: selectedModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: mode === "direct" ? 1000 : 1800,
    temperature: 0.85,
    stream: false,
  };

  /* ---- callUpstream helper ---- */
  async function callUpstream(payload: unknown): Promise<{
    rawContent: string;
    finishReason?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const baseUrl = TOKENHUB_BASE_URL.endsWith("/")
        ? TOKENHUB_BASE_URL.slice(0, -1)
        : TOKENHUB_BASE_URL;

      const upstreamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKENHUB_API_KEY}`,
          "User-Agent": "XTDDrama/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await upstreamRes.text().catch(() => upstreamRes.statusText);

      if (!upstreamRes.ok) {
        console.error(`[guess][${requestId}] upstream not ok`, upstreamRes.status, safeSnippet(rawText, 300));
        const err = new Error(`UPSTREAM_NOT_OK:${upstreamRes.status}`);
        (err as { status?: number; detail?: string }).status = upstreamRes.status;
        (err as { status?: number; detail?: string }).detail = rawText;
        throw err;
      }

      const upstreamData = (rawText ? JSON.parse(rawText) : {}) as {
        choices?: Array<{
          message?: { content?: string; reasoning_content?: string };
          finish_reason?: string;
        }>;
        error?: { message: string };
      };

      if (upstreamData.error) {
        console.error(`[guess][${requestId}] upstream error:`, upstreamData.error);
        throw new Error(`UPSTREAM_ERROR:${upstreamData.error.message}`);
      }

      const choice = upstreamData.choices?.[0];
      const msg = choice?.message as { content?: string; reasoning_content?: string } | undefined;
      const content = typeof msg?.content === "string" ? msg.content.trim() : "";
      const reasoning = typeof msg?.reasoning_content === "string" ? msg.reasoning_content.trim() : "";
      const rawContent = content || reasoning;
      if (!rawContent) {
        console.error(`[guess][${requestId}] empty content`);
        throw new Error("EMPTY_CONTENT");
      }
      return { rawContent, finishReason: choice?.finish_reason };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("TIMEOUT");
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ---- parseOptions helper ---- */
  function parseOptions(raw: string, allowSingle: boolean): { reply: string; options: GuessOption[] } {
    const jsonStr = extractJSON(raw);
    const parsed = JSON.parse(jsonStr) as Partial<GuessResult>;
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      throw new Error("reply 字段缺失或为空");
    }
    const minOptions = allowSingle ? 1 : 3;
    if (!Array.isArray(parsed.options) || parsed.options.length < minOptions) {
      throw new Error(`options 至少需要 ${minOptions} 项，实际：${JSON.stringify(parsed.options)?.slice(0, 80)}`);
    }
    const normalized = (parsed.options as unknown[])
      .slice(0, allowSingle ? 1 : 3)
      .map((o, idx) => normalizeOption(o, idx + 1))
      .filter((v): v is GuessOption => !!v);
    if (normalized.length < minOptions) {
      throw new Error("options 中存在非法项（缺少 id/title/prompt）");
    }
    return { reply: parsed.reply.trim(), options: normalized };
  }

  /* 6. 调用上游 API */
  let rawContent: string;
  let finishReason: string | undefined;

  try {
    const r = await callUpstream(requestPayload);
    rawContent = r.rawContent;
    finishReason = r.finishReason;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      return errorResponse("TIMEOUT", `AI 决策超时，请稍后重试（请求号：${requestId}）`, 504);
    }
    const status = (err as { status?: number }).status;
    const detail = (err as { detail?: string }).detail;
    if (typeof status === "number") {
      return errorResponse("UPSTREAM_ERROR", `大模型服务异常（${status}）：${safeSnippet(detail ?? String(err), 200)}（请求号：${requestId}）`, 502);
    }
    console.error(`[guess][${requestId}] upstream exception:`, err);
    return errorResponse("UPSTREAM_ERROR", `连接大模型服务失败（请求号：${requestId}）`, 502);
  }

  /* 7. 解析与校验 JSON */
  let result: GuessResult;
  let dedupLevel: GuessResponseMeta["dedupLevel"] = "none";

  const isDirect = mode === "direct";

  try {
    console.error(`[guess][${requestId}] rawContent`, safeSnippet(rawContent, 240), finishReason ? `(finish_reason:${finishReason})` : "");
    const parsed = parseOptions(rawContent, isDirect);
    result = parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldRetry =
      err instanceof SyntaxError ||
      msg.includes("JSON") ||
      msg.includes("Expected") ||
      finishReason === "length";

    if (!shouldRetry) {
      console.error(`[guess][${requestId}] JSON 解析失败`, err);
      return errorResponse("PARSE_ERROR", `AI 返回格式异常，解析失败（请求号：${requestId}）`, 500);
    }

    console.error(`[guess][${requestId}] parse failed, retry once`, msg);
    try {
      const retryPayload = {
        ...requestPayload,
        max_tokens: 2200,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\n## 额外硬约束\n- 输出必须是完整可被 JSON.parse 成功解析的 JSON（所有引号与括号必须闭合）\n- 不要截断，不要省略字段\n- 除 JSON 外禁止输出任何字符`,
          },
          { role: "user", content: userContent },
        ],
      };
      const r2 = await callUpstream(retryPayload);
      rawContent = r2.rawContent;
      finishReason = r2.finishReason;
      console.error(`[guess][${requestId}] retry rawContent`, safeSnippet(rawContent, 240));
      result = parseOptions(rawContent, isDirect);
    } catch (retryErr) {
      console.error(`[guess][${requestId}] retry failed`, retryErr);
      return errorResponse("PARSE_ERROR", `AI 返回格式异常，解析失败（请求号：${requestId}）`, 500);
    }
  }

  /* 8. 规则去重检查（仅 recommend 模式 + 有 exclude）*/
  if (!isDirect && exclude.length > 0) {
    const conflicts = ruleConflictCount(result.options, exclude);
    console.error(`[guess][${requestId}] rule dedup conflicts=${conflicts}`);

    if (conflicts > 0) {
      dedupLevel = "rule";
      // 语义兜底：重新调用模型，要求差异化重写
      try {
        const semanticSystemPrompt = `${systemPrompt}

## 语义差异化强约束（当前批次去重兜底）
检测到本批候选与历史批次存在 ${conflicts} 个雷同项，必须重新生成。
- 每个 option 的 Drama 改造方向和目标元素必须与历史批次完全不同
- title 不得使用历史批次已有的任何核心词汇
- description 必须描述全新的 Drama 改造思路
- prompt 的改造手法（具现化/尺度错位/材质异化）不得与历史批次已有的手法重复`;

        const semanticPayload = {
          model: selectedModel,
          messages: [
            { role: "system", content: semanticSystemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 2000,
          temperature: 0.9,
          stream: false,
        };

        const r3 = await callUpstream(semanticPayload);
        const semanticResult = parseOptions(r3.rawContent, false);
        const afterConflicts = ruleConflictCount(semanticResult.options, exclude);
        console.error(`[guess][${requestId}] semantic rewrite conflicts after=${afterConflicts}`);

        if (afterConflicts < conflicts) {
          result = semanticResult;
          dedupLevel = "semantic";
        } else {
          // 兜底：用第一次结果（不阻断链路）
          dedupLevel = "fallback";
        }
      } catch (semanticErr) {
        console.error(`[guess][${requestId}] semantic rewrite failed, fallback`, semanticErr);
        dedupLevel = "fallback";
      }
    }
  }

  /* 9. 返回结果 */
  const meta: GuessResponseMeta = {
    batchIndex,
    dedupLevel,
    hasUserHint: !!cleanHint,
  };

  const response: GuessSuccessResponse = {
    success: true,
    data: result,
    meta,
    ...(process.env.NODE_ENV === "development" && { rawContent }),
  };

  return NextResponse.json<GuessSuccessResponse>(response, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
