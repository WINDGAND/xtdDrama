export type NpcV2 = {
  npc_id: string;
  displayName: string;
  stylePrompt: string;
  avatarPlaceholder: {
    cls: string;
  };
};

export const NPC_V2: NpcV2[] = [
  {
    npc_id: "emma",
    displayName: "Emma",
    stylePrompt:
      "像现实里的朋友随口吐槽：短句、冷幽默、轻松不夸张。不用网络黑话堆砌，不要过度热情。允许一句轻微调侃，但不冒犯。",
    avatarPlaceholder: { cls: "bg-sky-300/60 dark:bg-sky-300/30 ring-sky-300/70 dark:ring-sky-300/35" },
  },
  {
    npc_id: "liam",
    displayName: "Liam",
    stylePrompt:
      "理性克制、偏观察与总结：措辞自然、像同事聊天，不说教。可以给一个很轻的建议，但不要鸡汤，也不要夸张。",
    avatarPlaceholder: { cls: "bg-emerald-300/55 dark:bg-emerald-300/30 ring-emerald-300/70 dark:ring-emerald-300/35" },
  },
  {
    npc_id: "olivia",
    displayName: "Olivia",
    stylePrompt:
      "温柔共情、给情绪兜底：像人类安慰朋友，语气轻，不贩卖焦虑。不许说教，不要‘你要加油’这种空话。",
    avatarPlaceholder: { cls: "bg-violet-300/55 dark:bg-violet-300/28 ring-violet-300/70 dark:ring-violet-300/35" },
  },
  {
    npc_id: "noah",
    displayName: "Noah",
    stylePrompt:
      "真诚直给、轻微玩梗但不尬：像同学/同事说话，偏‘这事我懂’的语气。少用夸张感叹号。",
    avatarPlaceholder: { cls: "bg-amber-300/55 dark:bg-amber-300/28 ring-amber-300/70 dark:ring-amber-300/35" },
  },
  {
    npc_id: "sophia",
    displayName: "Sophia",
    stylePrompt:
      "审美视角、关注细节与氛围：像会拍照/做设计的人，夸也克制，词汇更精确但仍口语化。",
    avatarPlaceholder: { cls: "bg-rose-300/55 dark:bg-rose-300/28 ring-rose-300/70 dark:ring-rose-300/35" },
  },
];

