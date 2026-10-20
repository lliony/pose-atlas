export type Notes = {
  pose: string;
  camera: string;
  composition: string;
  light: string;
  cautions: string;
};
export type Photo = {
  id: string;
  src: string;
  panel?: number | null;
  ai: boolean;
  notes: Partial<Notes>;
};
export type Category = { id: string; name: string; code: string };
export type Card = {
  id: string;
  categoryId: string;
  code: string;
  title: string;
  tags: string[];
  notes: Notes;
  privateNote?: string;
  images: Photo[];
  deleted?: boolean;
  source?: { url: string; title: string; author: string };
};
export type Album = {
  id: string;
  name: string;
  description: string;
  cardIds: string[];
  shareId?: string;
};
export type State = { categories: Category[]; cards: Card[]; albums: Album[] };
export type Publication = {
  id: string;
  name: string;
  description: string;
  cards: Card[];
  categories: Category[];
  publishedAt: string;
};
export const labels: Record<keyof Notes, string> = {
  pose: "动作步骤",
  camera: "拍摄机位",
  composition: "构图思路",
  light: "光线建议",
  cautions: "注意事项",
};
export const blankNotes: Notes = {
  pose: "",
  camera: "",
  composition: "",
  light: "",
  cautions: "",
};
export const uid = () => crypto.randomUUID();
