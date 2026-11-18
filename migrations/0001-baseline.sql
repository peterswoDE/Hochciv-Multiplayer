-- The schema as `sequelize.sync({ alter: true })` created it up to the introduction of migrations
-- (pg_dump --schema-only of a fresh database). Only applied to an empty database – see
-- 0001-baseline.js. Never edit this file: change the schema with a new migration.

CREATE TABLE public."TotpTokens" (
    id uuid NOT NULL,
    secret character varying(255) NOT NULL,
    name character varying(255) DEFAULT 'Authenticator App'::character varying,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "UserId" uuid
);

CREATE TABLE public.async_games (
    id uuid NOT NULL,
    "joinCode" character varying(255) NOT NULL,
    "hostUserId" uuid NOT NULL,
    status character varying(255) DEFAULT 'setup'::character varying NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "participantIds" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "invitedIds" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "waitingIds" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "waitSince" timestamp with time zone NOT NULL,
    reminded boolean DEFAULT false NOT NULL,
    round integer DEFAULT 0 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    state jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.banned_words (
    id uuid NOT NULL,
    word character varying(60) NOT NULL,
    kind character varying(255) DEFAULT 'ban'::character varying NOT NULL,
    match character varying(255) DEFAULT 'word'::character varying NOT NULL,
    "addedBy" character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.challenge_results (
    id uuid NOT NULL,
    "weekId" character varying(10) NOT NULL,
    "userId" uuid NOT NULL,
    username character varying(255) NOT NULL,
    "asyncId" uuid,
    finished boolean DEFAULT false NOT NULL,
    won boolean DEFAULT false NOT NULL,
    rounds integer,
    points integer,
    "gameId" uuid,
    "finishedAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.custom_maps (
    id uuid NOT NULL,
    "ownerId" uuid,
    name character varying(40) NOT NULL,
    map jsonb NOT NULL,
    code character varying(6),
    "publishedAt" timestamp with time zone,
    loads integer DEFAULT 0 NOT NULL,
    favorites integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.device_tokens (
    id uuid NOT NULL,
    token character varying(512) NOT NULL,
    platform character varying(16) DEFAULT 'android'::character varying NOT NULL,
    "lastSeenAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "UserId" uuid
);

CREATE TABLE public.friendships (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "friendId" uuid NOT NULL,
    status character varying(10) DEFAULT 'pending'::character varying NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.games (
    id uuid NOT NULL,
    version character varying(255),
    "durationRounds" integer NOT NULL,
    "matchDate" timestamp with time zone,
    "winnerUsername" character varying(255),
    participants json DEFAULT '[]'::json NOT NULL,
    stats jsonb,
    facts jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.map_favorites (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "mapId" uuid NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.oauth_providers (
    id uuid NOT NULL,
    provider character varying(255) NOT NULL,
    "clientId" character varying(255) DEFAULT ''::character varying NOT NULL,
    "clientSecret" character varying(255) DEFAULT ''::character varying NOT NULL,
    "botToken" character varying(255) DEFAULT ''::character varying NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.passkeys (
    id uuid NOT NULL,
    "credentialID" character varying(255) NOT NULL,
    "credentialPublicKey" bytea NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    transports json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "UserId" uuid
);

CREATE TABLE public.replay_frames (
    id bigint NOT NULL,
    "gameKey" uuid NOT NULL,
    seq integer NOT NULL,
    data bytea NOT NULL
);

CREATE SEQUENCE public.replay_frames_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.replay_frames_id_seq OWNED BY public.replay_frames.id;

CREATE TABLE public.replays (
    "gameId" uuid NOT NULL,
    version character varying(255),
    frames integer NOT NULL,
    data bytea NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.reports (
    id uuid NOT NULL,
    kind character varying(255) DEFAULT 'chat'::character varying NOT NULL,
    status character varying(255) DEFAULT 'open'::character varying NOT NULL,
    source character varying(255) NOT NULL,
    "sourceId" character varying(255) NOT NULL,
    "reporterId" uuid,
    "reporterName" character varying(255) NOT NULL,
    "reportedId" uuid,
    "reportedName" character varying(255) NOT NULL,
    reason character varying(500),
    message jsonb NOT NULL,
    context jsonb NOT NULL,
    auto boolean DEFAULT false NOT NULL,
    matches jsonb,
    penalty character varying(255),
    note character varying(1000),
    "handledBy" character varying(255),
    "handledAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.season_results (
    id uuid NOT NULL,
    "seasonId" character varying(16) NOT NULL,
    "userId" uuid NOT NULL,
    username character varying(255) NOT NULL,
    "accountType" character varying(10) DEFAULT 'human'::character varying NOT NULL,
    mmr integer NOT NULL,
    rank integer NOT NULL,
    tier character varying(10),
    games integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.seasons (
    id character varying(16) NOT NULL,
    "startsAt" timestamp with time zone NOT NULL,
    "endsAt" timestamp with time zone NOT NULL,
    "closedAt" timestamp with time zone
);

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);

CREATE TABLE public.users (
    id uuid NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255),
    origin character varying(255),
    password_hash character varying(255),
    mmr integer DEFAULT 1000 NOT NULL,
    "gamesPlayed" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    "activationCode" character varying(255),
    "activationCodeExpiresAt" timestamp with time zone,
    "resetCode" character varying(255),
    "resetCodeExpiresAt" timestamp with time zone,
    "pendingEmail" character varying(255),
    "emailChangeCode" character varying(255),
    "emailChangeCodeExpiresAt" timestamp with time zone,
    "activationCodeAttempts" integer DEFAULT 0 NOT NULL,
    "resetCodeAttempts" integer DEFAULT 0 NOT NULL,
    "emailOtpCodeAttempts" integer DEFAULT 0 NOT NULL,
    "emailChangeCodeAttempts" integer DEFAULT 0 NOT NULL,
    role character varying(255) DEFAULT 'user'::character varying NOT NULL,
    "accountType" character varying(255) DEFAULT 'human'::character varying NOT NULL,
    "ownerId" uuid,
    "botTokenHash" character varying(255),
    "botLimit" integer,
    "isBanned" boolean DEFAULT false NOT NULL,
    "googleId" character varying(255),
    "discordId" character varying(255),
    "avatarUrl" character varying(255),
    "totpSecret" character varying(255),
    "totpAttempts" integer DEFAULT 0 NOT NULL,
    "totpLockedUntil" timestamp with time zone,
    "totpEnabled" boolean DEFAULT false NOT NULL,
    "emailOtpEnabled" boolean DEFAULT false NOT NULL,
    "emailOtpCode" character varying(255),
    "emailOtpExpiry" timestamp with time zone,
    "notifyEmail" boolean DEFAULT true NOT NULL,
    "notifyPush" boolean DEFAULT true NOT NULL,
    "blockedPlayers" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "lobbyPresets" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "termsVersion" character varying(255),
    "termsAcceptedAt" timestamp with time zone,
    "currentChallenge" character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.replay_frames ALTER COLUMN id SET DEFAULT nextval('public.replay_frames_id_seq'::regclass);

ALTER TABLE ONLY public."TotpTokens"
    ADD CONSTRAINT "TotpTokens_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public.async_games
    ADD CONSTRAINT async_games_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.banned_words
    ADD CONSTRAINT banned_words_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.challenge_results
    ADD CONSTRAINT challenge_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.custom_maps
    ADD CONSTRAINT custom_maps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.map_favorites
    ADD CONSTRAINT map_favorites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_providers
    ADD CONSTRAINT oauth_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.replay_frames
    ADD CONSTRAINT replay_frames_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.replays
    ADD CONSTRAINT replays_pkey PRIMARY KEY ("gameId");

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.season_results
    ADD CONSTRAINT season_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);

CREATE INDEX async_games_invited_ids ON public.async_games USING gin ("invitedIds");

CREATE UNIQUE INDEX "async_games_joinCode_key" ON public.async_games USING btree ("joinCode");

CREATE INDEX async_games_participant_ids ON public.async_games USING gin ("participantIds");

CREATE INDEX async_games_status ON public.async_games USING btree (status);

CREATE UNIQUE INDEX banned_words_word_key ON public.banned_words USING btree (word);

CREATE INDEX challenge_results_async ON public.challenge_results USING btree ("asyncId");

CREATE INDEX challenge_results_user ON public.challenge_results USING btree ("userId");

CREATE INDEX challenge_results_week_user ON public.challenge_results USING btree ("weekId", "userId");

CREATE UNIQUE INDEX custom_maps_code_key ON public.custom_maps USING btree (code);

CREATE UNIQUE INDEX custom_maps_owner_name_key ON public.custom_maps USING btree ("ownerId", name);

CREATE INDEX custom_maps_published ON public.custom_maps USING btree ("publishedAt");

CREATE UNIQUE INDEX device_tokens_token_key ON public.device_tokens USING btree (token);

CREATE INDEX friendships_friend ON public.friendships USING btree ("friendId");

CREATE UNIQUE INDEX friendships_pair_key ON public.friendships USING btree ("userId", "friendId");

CREATE INDEX map_favorites_map ON public.map_favorites USING btree ("mapId");

CREATE UNIQUE INDEX map_favorites_user_map_key ON public.map_favorites USING btree ("userId", "mapId");

CREATE UNIQUE INDEX oauth_providers_provider_key ON public.oauth_providers USING btree (provider);

CREATE UNIQUE INDEX "passkeys_credentialID_key" ON public.passkeys USING btree ("credentialID");

CREATE INDEX replay_frames_game_seq ON public.replay_frames USING btree ("gameKey", seq);

CREATE INDEX reports_status_created ON public.reports USING btree (status, "createdAt");

CREATE UNIQUE INDEX season_results_season_user_key ON public.season_results USING btree ("seasonId", "userId");

CREATE INDEX season_results_user ON public.season_results USING btree ("userId");

CREATE UNIQUE INDEX users_bot_token_key ON public.users USING btree ("botTokenHash");

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);

ALTER TABLE ONLY public."TotpTokens"
    ADD CONSTRAINT "TotpTokens_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT "device_tokens_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.games
    ADD CONSTRAINT "games_winnerUsername_fkey" FOREIGN KEY ("winnerUsername") REFERENCES public.users(username) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT "passkeys_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

