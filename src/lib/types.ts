export type Event = {
  id: string;
  owner_id?: string;
  title: string;
  city: string;
  venue: string;
  starts_at: string;
  deadline: string;
  registration_open: boolean;
  rules: string;
  dj: string;
  mc: string;
  judges?: string;
  version: number;
  groups?: Group[];
};
export type Group = {
  id: string;
  event_id: string;
  name: string;
  style: string;
  fee: number;
  slots: number;
  open: boolean;
  closed_at: string | null;
  closed_by: string | null;
  locked_at: string | null;
  current_match: string | null;
  version: number;
};
export type Entry = {
  id: string;
  group_id: string;
  dancer: string;
  number: number;
  phone?: string;
  token?: string;
  paid?: boolean;
  paid_at?: string;
  checked_at: string | null;
  version: number;
};
export type Score = {
  id: string;
  entry_id: string;
  judge_id: string;
  score: number;
  comment: string;
  version: number;
  updated_at: string;
};
export type Match = {
  id: string;
  group_id: string;
  round: number;
  position: number;
  a: string;
  b: string;
  winner: string | null;
  version: number;
};
export type Member = {
  id: string;
  event_id: string;
  user_id: string;
  role: string;
  group_ids: string[];
  starts_at: string;
  ends_at: string;
  revoked_at: string | null;
};
export type Invitation = {
  id: string;
  event_id: string;
  email: string;
  role: string;
  group_ids: string[];
  starts_at: string;
  ends_at: string;
  status: string;
};
export type Workspace = {
  user_id: string;
  events: Event[];
  groups: Group[];
  entries: Entry[];
  scores: Score[];
  matches: Match[];
  memberships: Member[];
  invitations: Invitation[];
  votes: {
    match_id: string;
    judge_id: string;
    entry_id: string;
    version: number;
  }[];
  audit: {
    id: number;
    event_id: string;
    action: string;
    actor: string;
    created_at: string;
    payload: Record<string, unknown>;
  }[];
};
export type Snapshot = {
  published: boolean;
  published_at?: string;
  data?: {
    event_title: string;
    group_name: string;
    current_match: string | null;
    dancers: Pick<Entry, "id" | "dancer" | "number">[];
    matches: Match[];
  };
};
