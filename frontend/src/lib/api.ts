import { getAccessToken, setAccessToken } from "./tokenStore";
import type {
  AdminUser,
  AuditAction,
  AuditLogEntry,
  Comment,
  Document,
  DocumentVersion,
  Folder,
  Notification,
  Permission,
  Role,
  SystemRole,
  User,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = await res.json();
        setAccessToken(data.accessToken);
        return true;
      } catch {
        setAccessToken(null);
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function apiFetch(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  const token = getAccessToken();
  const isFormBody = options.body instanceof FormData;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && !isFormBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry && path !== "/api/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch(path, options, false);
    }
  }

  return res;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    let code = "UNKNOWN_ERROR";
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// --- Auth ---

export async function register(name: string, email: string, password: string) {
  const data = await request<{ user: User; accessToken: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function login(email: string, password: string) {
  const data = await request<{ user: User; accessToken: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  setAccessToken(null);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const data = await request<{ accessToken: string }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  // The server rotates sessions on password change; adopt the fresh access token.
  setAccessToken(data.accessToken);
}

export async function bootstrapSession(): Promise<User | null> {
  const refreshed = await tryRefresh();
  if (!refreshed) return null;
  try {
    const data = await request<{ user: User }>("/api/auth/me");
    return data.user;
  } catch {
    return null;
  }
}

// --- Folders ---

export async function listFolders(parentId: string | null): Promise<Folder[]> {
  const query = parentId ? `?parentId=${parentId}` : "";
  const data = await request<{ folders: Folder[] }>(`/api/folders${query}`);
  return data.folders;
}

export async function getFolder(id: string): Promise<Folder> {
  const data = await request<{ folder: Folder }>(`/api/folders/${id}`);
  return data.folder;
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const data = await request<{ folder: Folder }>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
  return data.folder;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const data = await request<{ folder: Folder }>(`/api/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return data.folder;
}

export async function deleteFolder(id: string): Promise<void> {
  await request(`/api/folders/${id}`, { method: "DELETE" });
}

export async function listDeletedFolders(): Promise<Folder[]> {
  const data = await request<{ folders: Folder[] }>("/api/folders/trash");
  return data.folders;
}

export async function restoreFolder(id: string): Promise<Folder> {
  const data = await request<{ folder: Folder }>(`/api/folders/${id}/restore`, { method: "POST" });
  return data.folder;
}

// --- Documents ---

export interface DocumentFilters {
  folderId?: string | null;
  q?: string;
  tag?: string;
  mimeType?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export async function listDocuments(filters: DocumentFilters): Promise<Document[]> {
  const params = new URLSearchParams();
  if (filters.folderId) params.set("folderId", filters.folderId);
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.mimeType) params.set("mimeType", filters.mimeType);
  if (filters.updatedAfter) params.set("updatedAfter", filters.updatedAfter);
  if (filters.updatedBefore) params.set("updatedBefore", filters.updatedBefore);
  const query = params.toString();
  const data = await request<{ documents: Document[] }>(`/api/documents${query ? `?${query}` : ""}`);
  return data.documents;
}

export async function getDocument(id: string): Promise<Document> {
  const data = await request<{ document: Document }>(`/api/documents/${id}`);
  return data.document;
}

export async function presignUpload(fileName: string, mimeType: string, size: number, folderId: string | null) {
  return request<{ uploadUrl: string; s3Key: string }>("/api/documents/presign-upload", {
    method: "POST",
    body: JSON.stringify({ fileName, mimeType, size, folderId }),
  });
}

export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      // Must match the header the backend signed into the URL (see presignDocumentUpload /
      // getPresignedUploadUrl in backend/src/lib/s3.ts) or S3/MinIO rejects the request.
      "x-amz-server-side-encryption": "AES256",
    },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload to storage failed with status ${res.status}`);
  }
}

export async function createDocument(input: {
  name: string;
  folderId: string | null;
  tags: string[];
  s3Key: string;
  size: number;
  mimeType: string;
}): Promise<Document> {
  const data = await request<{ document: Document }>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.document;
}

export async function renameDocument(id: string, name: string): Promise<Document> {
  const data = await request<{ document: Document }>(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  await request(`/api/documents/${id}`, { method: "DELETE" });
}

export async function listDeletedDocuments(): Promise<Document[]> {
  const data = await request<{ documents: Document[] }>("/api/documents/trash");
  return data.documents;
}

export async function restoreDocument(id: string): Promise<Document> {
  const data = await request<{ document: Document }>(`/api/documents/${id}/restore`, { method: "POST" });
  return data.document;
}

export async function getDownloadUrl(id: string): Promise<string> {
  const data = await request<{ url: string }>(`/api/documents/${id}/download-url`);
  return data.url;
}

export async function getPreviewUrl(id: string): Promise<{ url: string; mimeType: string }> {
  return request<{ url: string; mimeType: string }>(`/api/documents/${id}/preview-url`);
}

// --- Sharing ---

export async function lookupUserByEmail(email: string): Promise<User> {
  const data = await request<{ user: User }>(`/api/users/lookup?email=${encodeURIComponent(email)}`);
  return data.user;
}

export async function listDocumentPermissions(documentId: string): Promise<Permission[]> {
  const data = await request<{ permissions: Permission[] }>(`/api/documents/${documentId}/permissions`);
  return data.permissions;
}

export async function grantDocumentPermission(documentId: string, userId: string, role: Role): Promise<Permission> {
  const data = await request<{ permission: Permission }>(`/api/documents/${documentId}/permissions`, {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
  return data.permission;
}

export async function revokeDocumentPermission(documentId: string, permissionId: string): Promise<void> {
  await request(`/api/documents/${documentId}/permissions/${permissionId}`, { method: "DELETE" });
}

// --- Versions ---

export async function presignVersionUpload(documentId: string, fileName: string, mimeType: string, size: number) {
  return request<{ uploadUrl: string; s3Key: string }>(`/api/documents/${documentId}/versions/presign-upload`, {
    method: "POST",
    body: JSON.stringify({ fileName, mimeType, size }),
  });
}

export async function addDocumentVersion(
  documentId: string,
  input: { s3Key: string; size: number; mimeType: string }
): Promise<Document> {
  const data = await request<{ document: Document }>(`/api/documents/${documentId}/versions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.document;
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const data = await request<{ versions: DocumentVersion[] }>(`/api/documents/${documentId}/versions`);
  return data.versions;
}

export async function getVersionDownloadUrl(documentId: string, versionId: string): Promise<string> {
  const data = await request<{ url: string }>(`/api/documents/${documentId}/versions/${versionId}/download-url`);
  return data.url;
}

export async function getVersionText(documentId: string, versionId: string): Promise<string> {
  const data = await request<{ text: string }>(`/api/documents/${documentId}/versions/${versionId}/text`);
  return data.text;
}

// --- Comments ---

export async function listComments(documentId: string): Promise<Comment[]> {
  const data = await request<{ comments: Comment[] }>(`/api/documents/${documentId}/comments`);
  return data.comments;
}

export async function createComment(documentId: string, content: string): Promise<Comment> {
  const data = await request<{ comment: Comment }>(`/api/documents/${documentId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return data.comment;
}

export async function resolveComment(documentId: string, commentId: string, resolved: boolean): Promise<Comment> {
  const data = await request<{ comment: Comment }>(`/api/documents/${documentId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved }),
  });
  return data.comment;
}

export async function deleteComment(documentId: string, commentId: string): Promise<void> {
  await request(`/api/documents/${documentId}/comments/${commentId}`, { method: "DELETE" });
}

// --- Audit log ---

export async function getDocumentAuditLog(documentId: string): Promise<AuditLogEntry[]> {
  const data = await request<{ logs: AuditLogEntry[] }>(`/api/documents/${documentId}/audit-log`);
  return data.logs;
}

// --- Admin ---

export async function adminListUsers(
  filters: { q?: string; status?: "all" | "active" | "deactivated" } = {}
): Promise<{ users: AdminUser[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  const query = params.toString();
  return request<{ users: AdminUser[]; total: number }>(`/api/admin/users${query ? `?${query}` : ""}`);
}

export async function adminSetUserRole(userId: string, role: SystemRole): Promise<AdminUser> {
  const data = await request<{ user: AdminUser }>(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return data.user;
}

export async function adminSetUserActivation(userId: string, deactivated: boolean): Promise<AdminUser> {
  const data = await request<{ user: AdminUser }>(`/api/admin/users/${userId}/activation`, {
    method: "PATCH",
    body: JSON.stringify({ deactivated }),
  });
  return data.user;
}

export async function adminResetUserPassword(
  userId: string,
  newPassword?: string
): Promise<{ user: AdminUser; generatedPassword: string | null }> {
  return request<{ user: AdminUser; generatedPassword: string | null }>(
    `/api/admin/users/${userId}/password`,
    {
      method: "PATCH",
      body: JSON.stringify(newPassword ? { newPassword } : {}),
    }
  );
}

export async function adminListAuditLog(filters: {
  userId?: string;
  action?: AuditAction;
} = {}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.action) params.set("action", filters.action);
  const query = params.toString();
  return request<{ logs: AuditLogEntry[]; total: number }>(`/api/admin/audit-log${query ? `?${query}` : ""}`);
}

// --- Notifications ---

export async function listNotifications(
  filters: { unreadOnly?: boolean; take?: number } = {}
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const params = new URLSearchParams();
  if (filters.unreadOnly) params.set("unreadOnly", "true");
  if (filters.take) params.set("take", String(filters.take));
  const query = params.toString();
  return request<{ notifications: Notification[]; unreadCount: number }>(
    `/api/notifications${query ? `?${query}` : ""}`
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/api/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request("/api/notifications/read-all", { method: "POST" });
}
