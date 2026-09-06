import path from 'path';
import fs from 'fs';

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  file: string;
  line: number;
  selectedText?: string;
  author: string;
  text: string;
  createdAt: string;
  status: 'open' | 'resolved';
  replies: CommentReply[];
}

const COMMENTS_FILE = '.comments.json';

function getCommentsPath(projectDir: string): string {
  return path.join(projectDir, COMMENTS_FILE);
}

export function loadComments(projectDir: string): CommentThread[] {
  const filePath = getCommentsPath(projectDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse .comments.json:', err);
    return [];
  }
}

export function saveComments(projectDir: string, comments: CommentThread[]): void {
  const filePath = getCommentsPath(projectDir);
  fs.writeFileSync(filePath, JSON.stringify(comments, null, 2), 'utf-8');
}

export function addCommentThread(
  projectDir: string,
  params: {
    file: string;
    line: number;
    selectedText?: string;
    author: string;
    text: string;
  }
): CommentThread {
  const comments = loadComments(projectDir);
  const newThread: CommentThread = {
    id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    file: params.file.replace(/\\/g, '/'),
    line: params.line,
    selectedText: params.selectedText,
    author: params.author || 'Reviewer',
    text: params.text,
    createdAt: new Date().toISOString(),
    status: 'open',
    replies: [],
  };

  comments.push(newThread);
  saveComments(projectDir, comments);
  return newThread;
}

export function addCommentReply(
  projectDir: string,
  commentId: string,
  params: {
    author: string;
    text: string;
  }
): CommentThread | null {
  const comments = loadComments(projectDir);
  const thread = comments.find((c) => c.id === commentId);
  if (!thread) return null;

  const reply: CommentReply = {
    id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    author: params.author || 'Reviewer',
    text: params.text,
    createdAt: new Date().toISOString(),
  };

  thread.replies.push(reply);
  saveComments(projectDir, comments);
  return thread;
}

export function updateCommentStatus(
  projectDir: string,
  commentId: string,
  status: 'open' | 'resolved'
): CommentThread | null {
  const comments = loadComments(projectDir);
  const thread = comments.find((c) => c.id === commentId);
  if (!thread) return null;

  thread.status = status;
  saveComments(projectDir, comments);
  return thread;
}

export function deleteCommentThread(
  projectDir: string,
  commentId: string
): boolean {
  const comments = loadComments(projectDir);
  const filtered = comments.filter((c) => c.id !== commentId);
  if (filtered.length === comments.length) return false;

  saveComments(projectDir, filtered);
  return true;
}
