export type SystemRole = "USER" | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  systemRole?: SystemRole;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  deactivatedAt: string | null;
  createdAt: string;
  _count?: { ownedDocuments: number; ownedFolders: number };
}

export type Role = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  s3Key: string;
  size: number;
  mimeType: string;
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string };
}

export interface Document {
  id: string;
  name: string;
  ownerId: string;
  folderId: string | null;
  tags: string[];
  currentVersionId: string | null;
  currentVersion: DocumentVersion | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Permission {
  id: string;
  resourceType: "FOLDER" | "DOCUMENT";
  resourceId: string;
  userId: string;
  role: Role;
  grantedById: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface Comment {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  resolved: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface PresenceUser {
  userId: string;
  name: string;
  email: string;
}

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "REGISTER"
  | "VIEW"
  | "DOWNLOAD"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "RESTORE"
  | "UPLOAD_VERSION"
  | "SHARE"
  | "UNSHARE"
  | "COMMENT"
  | "PROMOTE"
  | "DEMOTE"
  | "DEACTIVATE"
  | "REACTIVATE"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGE";

export type NotificationType = "SHARED" | "UNSHARED" | "MENTIONED" | "COMMENT_ON_OWNED";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  resourceType: "FOLDER" | "DOCUMENT" | null;
  resourceId: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  action: AuditAction;
  resourceType: "FOLDER" | "DOCUMENT" | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
