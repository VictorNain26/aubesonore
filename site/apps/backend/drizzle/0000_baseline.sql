CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_provider_id_account_id_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "artist" (
	"id" text PRIMARY KEY NOT NULL,
	"normalized_name" text NOT NULL,
	"display_name" text NOT NULL,
	"deezer_id" text,
	"mbid" text,
	"identified_by" text DEFAULT 'name' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_profile" (
	"artist_id" text PRIMARY KEY NOT NULL,
	"photo" jsonb,
	"summary_fr" jsonb,
	"summary_en" jsonb,
	"refreshed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_slug" (
	"slug" text PRIMARY KEY NOT NULL,
	"artist_id" text,
	"mbid" text,
	CONSTRAINT "artist_slug_artist_id_unique" UNIQUE("artist_id"),
	CONSTRAINT "artist_slug_one_owner" CHECK (num_nonnulls("artist_slug"."artist_id", "artist_slug"."mbid") = 1)
);
--> statement-breakpoint
CREATE TABLE "discovered_artist" (
	"mbid" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liked_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"artwork_url" text,
	"youtube_url" text NOT NULL,
	"isrc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"artist_id" text
);
--> statement-breakpoint
CREATE TABLE "radio_play" (
	"id" text PRIMARY KEY NOT NULL,
	"sh_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"artist_normalized" text NOT NULL,
	"isrc" text,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "youtube_link" (
	"song_key" text PRIMARY KEY NOT NULL,
	"video_id" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profile" ADD CONSTRAINT "artist_profile_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_slug" ADD CONSTRAINT "artist_slug_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liked_tracks" ADD CONSTRAINT "liked_tracks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liked_tracks" ADD CONSTRAINT "liked_tracks_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_normalized_name_unique" ON "artist" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_deezer_id_unique" ON "artist" USING btree ("deezer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_mbid_unique" ON "artist" USING btree ("mbid");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_slug_mbid_unique" ON "artist_slug" USING btree ("mbid");--> statement-breakpoint
CREATE INDEX "artist_slug_slug_pattern" ON "artist_slug" USING btree ("slug" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "liked_tracks_user_id_idx" ON "liked_tracks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "liked_tracks_artist_user_idx" ON "liked_tracks" USING btree ("artist_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liked_tracks_user_title_artist_unique" ON "liked_tracks" USING btree ("user_id","title","artist");--> statement-breakpoint
CREATE INDEX "liked_tracks_user_created_at_idx" ON "liked_tracks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "radio_play_sh_id_unique" ON "radio_play" USING btree ("sh_id");--> statement-breakpoint
CREATE INDEX "radio_play_artist_played_at_idx" ON "radio_play" USING btree ("artist_normalized","played_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "youtube_link_checked_at_idx" ON "youtube_link" USING btree ("checked_at");