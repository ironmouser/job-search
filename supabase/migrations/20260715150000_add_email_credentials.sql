ALTER TABLE "user_preferences" 
ADD COLUMN "emailAddress" TEXT,
ADD COLUMN "emailAppPassword" TEXT,
ADD COLUMN "imapHost" TEXT DEFAULT 'imap.gmail.com',
ADD COLUMN "imapPort" INTEGER DEFAULT 993;
