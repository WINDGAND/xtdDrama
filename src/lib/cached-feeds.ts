import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export type PlazaPostRow = {
  id: string;
  created_at: string;
  mode: "image" | "video";
  style: string;
  result_url: string;
  main_entity: string | null;
  scene_state: string | null;
  user_emotion: string | null;
  user_id: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  initial_likes: PlazaLikeRow[];
  comment_count: number;
  comment_preview: string | null;
};

export type PlazaLikeRow = {
  id: string;
  created_at: string;
  actor_type: "npc" | "user";
  user_id?: string | null;
  npc_id: string | null;
  display_name: string | null;
};

export type MePostRow = {
  id: string;
  created_at: string;
  mode: "image" | "video";
  style: string;
  main_entity: string | null;
  user_emotion: string | null;
};

export type PostDetailRow = {
  id: string;
  created_at: string;
  mode: "image" | "video";
  style: string;
  result_url: string;
  main_entity: string | null;
  scene_state: string | null;
  user_emotion: string | null;
};

/** 广场列表缓存（按 tag 失效） */
const fetchPlazaPostsCached = unstable_cache(
  async (): Promise<PlazaPostRow[] | null> => {
    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from("posts")
        .select("id, created_at, mode, style, result_url, main_entity, scene_state, user_emotion, user_id")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return null;

      const posts = ((data ?? []) as Array<
        Omit<PlazaPostRow, "author_display_name" | "author_avatar_url" | "initial_likes" | "comment_count" | "comment_preview">
      >).map((p) => ({
        ...p,
        author_display_name: null,
        author_avatar_url: null,
        initial_likes: [],
        comment_count: 0,
        comment_preview: null,
      }));

      const userIds = Array.from(
        new Set(posts.map((p) => p.user_id).filter((v): v is string => typeof v === "string" && v.length > 0))
      );
      const postIds = posts.map((p) => p.id);

      const [profilesRes, likesRes, commentsRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        postIds.length > 0
          ? supabase
              .from("post_likes")
              .select("id, created_at, post_id, actor_type, user_id, npc_id, display_name")
              .in("post_id", postIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        postIds.length > 0
          ? supabase
              .from("comments")
              .select("id, created_at, post_id, author_type, content, status")
              .in("post_id", postIds)
              .eq("status", "ready")
              .order("created_at", { ascending: true })
              .limit(300)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      if (!profilesRes.error) {
        for (const row of (profilesRes.data ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
          profileMap.set(row.id, { display_name: row.display_name, avatar_url: row.avatar_url });
        }
      }

      const likeMap = new Map<string, PlazaLikeRow[]>();
      if (!likesRes.error) {
        for (const row of (likesRes.data ?? []) as Array<PlazaLikeRow & { post_id: string }>) {
          const list = likeMap.get(row.post_id) ?? [];
          list.push({
            id: row.id,
            created_at: row.created_at,
            actor_type: row.actor_type,
            user_id: row.user_id,
            npc_id: row.npc_id,
            display_name: row.display_name,
          });
          likeMap.set(row.post_id, list);
        }
      }

      const commentSummaryMap = new Map<string, { count: number; preview: string | null }>();
      if (!commentsRes.error) {
        for (const row of (commentsRes.data ?? []) as Array<{ post_id: string; author_type: "npc" | "user"; content: string }>) {
          const current = commentSummaryMap.get(row.post_id) ?? { count: 0, preview: null };
          current.count += 1;
          if (!current.preview && row.author_type === "npc") current.preview = row.content;
          if (!current.preview) current.preview = row.content;
          commentSummaryMap.set(row.post_id, current);
        }
      }

      return posts.map((p) => {
        const prof = p.user_id ? profileMap.get(p.user_id) : null;
        const comments = commentSummaryMap.get(p.id);
        return {
          ...p,
          author_display_name: prof?.display_name ?? null,
          author_avatar_url: prof?.avatar_url ?? null,
          initial_likes: likeMap.get(p.id) ?? [],
          comment_count: comments?.count ?? 0,
          comment_preview: comments?.preview ?? null,
        };
      });
    } catch {
      return null;
    }
  },
  ["plaza-feed-v1"],
  { revalidate: 30, tags: ["plaza-posts"] }
);

export async function getCachedPlazaPosts(): Promise<PlazaPostRow[] | null> {
  return fetchPlazaPostsCached();
}

/** 我的作品：按 userId 分桶缓存；tag me-posts 用于删除等无法拿到 userId 时整批失效 */
const fetchMePostsCached = unstable_cache(
  async (userId: string): Promise<MePostRow[] | null> => {
    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from("posts")
        .select("id, created_at, mode, style, main_entity, user_emotion")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return null;
      return (data ?? []) as MePostRow[];
    } catch {
      return null;
    }
  },
  ["me-feed-v1"],
  { revalidate: 30, tags: ["me-posts"] }
);

export async function getCachedMePosts(userId: string): Promise<MePostRow[] | null> {
  return fetchMePostsCached(userId);
}

/** 作品详情：按 id 分桶；统一 tag posts 在发布/删除时失效 */
const fetchPostDetailCached = unstable_cache(
  async (id: string): Promise<PostDetailRow | null> => {
    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from("posts")
        .select("id, created_at, mode, style, result_url, main_entity, scene_state, user_emotion")
        .eq("id", id)
        .maybeSingle();
      if (error) return null;
      return (data as PostDetailRow | null) ?? null;
    } catch {
      return null;
    }
  },
  ["post-detail-v1"],
  { revalidate: 60, tags: ["posts"] }
);

export async function getCachedPostById(id: string): Promise<PostDetailRow | null> {
  return fetchPostDetailCached(id);
}
