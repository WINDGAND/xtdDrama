/**
 * mock-drama-examples.ts — API 降级演示模式预置示例
 *
 * 当 TokenHub API 不可用（限流/超时/网络问题）时，
 * 自动切换到"演示模式"，展示预置的高质量示例效果，
 * 确保路演/评审时不翻车。
 *
 * 图片资产准备指南（public/mock/ 目录）：
 *   ex1-origin.jpg / ex1-result.jpg  →  DDL 崩溃场景（焦虑）→ 史诗剧照轴
 *   ex2-origin.jpg / ex2-result.jpg  →  食物意外场景（烦躁）→ 手绘日记轴
 *   ex3-origin.jpg / ex3-result.jpg  →  日常等待场景（无聊）→ 胶片年代轴
 */

export interface MockNpcComment {
  npcId: string;
  displayName: string;
  content: string;
  delayMs: number;
}

export interface MockExample {
  id: string;
  label: string;
  analysis: {
    mainEntity: string;
    sceneState: string;
    userEmotion: string;
    evidence?: string;
    imageType?: string;
  };
  guessReply: string;
  style: string;
  axisTag: "史诗感" | "手绘感" | "胶片感";
  originSrc: string;
  resultSrc: string;
  mode: "image" | "video";
  npcComments: MockNpcComment[];
}

export const MOCK_EXAMPLES: MockExample[] = [
  {
    id: "ex1",
    label: "DDL 崩溃重构",
    analysis: {
      mainEntity: "堆满文档的电脑屏幕",
      sceneState: "昏暗宿舍，蓝光屏幕，凌晨时分",
      userEmotion: "焦虑",
      evidence: "满屏错误提示和密密麻麻的修改批注",
      imageType: "scene",
    },
    guessReply: "满屏红色批注，但咖啡还温着，今晚撑得住的。",
    style: "史诗剧照感",
    axisTag: "史诗感",
    originSrc: "/mock/ex1-origin.jpg",
    resultSrc: "/mock/ex1-result.jpg",
    mode: "image",
    npcComments: [
      { npcId: "emma", displayName: "Emma", content: "这个光影……我怎么感觉看到了某部学生纪录片的封面 😭", delayMs: 3200 },
      { npcId: "liam", displayName: "Liam", content: "DDL 的压迫感被这张图拍出来了，比文字描述有力多了。", delayMs: 7800 },
      { npcId: "olivia", displayName: "Olivia", content: "屏幕的蓝光打在这里，说不清是美还是悲，两个都有吧 🥹", delayMs: 12500 },
      { npcId: "noah", displayName: "Noah", content: "这种氛围我太懂了，论文答辩前三天的脸就这样。", delayMs: 17000 },
      { npcId: "sophia", displayName: "Sophia", content: "构图和光向量做到了，这张发出去很容易引发共鸣 ✨", delayMs: 22000 },
    ],
  },
  {
    id: "ex2",
    label: "食堂意外重构",
    analysis: {
      mainEntity: "洒在桌面的红烧肉",
      sceneState: "嘈杂食堂，塑料餐盘，午餐时间",
      userEmotion: "烦躁",
      evidence: "汤汁四溅，餐盘倾斜",
      imageType: "food",
    },
    guessReply: "汤汁溅开的瞬间，比今天的心情还诚实。",
    style: "手绘日记感",
    axisTag: "手绘感",
    originSrc: "/mock/ex2-origin.jpg",
    resultSrc: "/mock/ex2-result.jpg",
    mode: "image",
    npcComments: [
      { npcId: "emma", displayName: "Emma", content: "用手绘画食堂意外这个创意太绝了，有种漫画里的倒霉蛋主角感 😂", delayMs: 4000 },
      { npcId: "liam", displayName: "Liam", content: "线条松弛反而让这种倒霉显得很可爱，不那么难受了。", delayMs: 9500 },
      { npcId: "olivia", displayName: "Olivia", content: "手绘质感让这个瞬间多了点温度，倒霉也是一种真实的生活啊 🙈", delayMs: 14000 },
      { npcId: "noah", displayName: "Noah", content: "这种手稿感，把糟糕事画进日记的感觉，很准。", delayMs: 19000 },
      { npcId: "sophia", displayName: "Sophia", content: "笔触的松弛和食物细节的细腻形成对比，层次挺好的。", delayMs: 23500 },
    ],
  },
  {
    id: "ex3",
    label: "等车无聊重构",
    analysis: {
      mainEntity: "站台上孤独的背影",
      sceneState: "傍晚公交站，暖光路灯，人群散去",
      userEmotion: "无聊",
      evidence: "空旷站台，路灯晕染，一人等待",
      imageType: "scene",
    },
    guessReply: "路灯的颜色比手机屏幕暖多了，今晚可以不刷了。",
    style: "胶片年代感",
    axisTag: "胶片感",
    originSrc: "/mock/ex3-origin.jpg",
    resultSrc: "/mock/ex3-result.jpg",
    mode: "image",
    npcComments: [
      { npcId: "emma", displayName: "Emma", content: "等车这件事，用胶片感来拍，突然有点电影感了 📷", delayMs: 3800 },
      { npcId: "liam", displayName: "Liam", content: "颗粒感给这个场景加了时间厚度，让人觉得这个瞬间值得被记住。", delayMs: 8200 },
      { npcId: "olivia", displayName: "Olivia", content: "看到这张图，我脑子里直接有了那个傍晚的气温 🥹", delayMs: 13000 },
      { npcId: "noah", displayName: "Noah", content: "这种暖调胶片感和站台场景太配了，氛围一下就对了。", delayMs: 18500 },
      { npcId: "sophia", displayName: "Sophia", content: "色温和颗粒控制得很克制，没有过度处理，好的胶片感就该这样。", delayMs: 22800 },
    ],
  },
];

/** 根据用户上传图片的情绪标签选择最匹配的 mock 示例 */
export function selectMockByEmotion(userEmotion?: string): MockExample {
  const emotion = userEmotion ?? "";
  if (["焦虑", "疲惫", "崩溃", "委屈"].includes(emotion)) return MOCK_EXAMPLES[0];
  if (["烦躁", "尴尬", "无奈"].includes(emotion)) return MOCK_EXAMPLES[1];
  return MOCK_EXAMPLES[2];
}
