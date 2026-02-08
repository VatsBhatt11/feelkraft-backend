-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "image1Url" TEXT NOT NULL,
    "image2Url" TEXT NOT NULL,
    "prompt" TEXT,
    "theme" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "generatedImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "pageNum" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "resultUrl" TEXT,
    "costTime" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ComicJob" ADD CONSTRAINT "ComicJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationLog" ADD CONSTRAINT "GenerationLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ComicJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
