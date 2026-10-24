import { ProjectDocument } from '../types/crm';
import { storageService } from '../services/storageService';

/**
 * Normalizes a document object which might be a JSON string or raw object
 */
export function normalizeDocument(doc: any): ProjectDocument | null {
  if (!doc) return null;
  if (typeof doc === 'string') {
    try {
      const parsed = JSON.parse(doc);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof doc === 'object') {
    return doc;
  }
  return null;
}

/**
 * Checks if a document has any valid reference or payload
 */
export function isDocumentAvailable(doc: any): boolean {
  const normalized = normalizeDocument(doc);
  if (!normalized) return false;
  return Boolean(normalized.name || normalized.url || normalized.externalUrl);
}

/**
 * Converts a base64 Data URL to a native browser Blob
 */
export function base64ToBlob(dataUrl: string): { blob: Blob; mimeType: string } | null {
  try {
    const arr = dataUrl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return {
      blob: new Blob([u8arr], { type: mimeType }),
      mimeType,
    };
  } catch (err) {
    console.error('[base64ToBlob] Error converting base64 data URL to Blob:', err);
    return null;
  }
}

/**
 * Authenticated fetch helper to fetch document blob from the backend
 */
export async function fetchAuthenticatedDocumentBlob(
  projectId: string,
  docType: 'proposal' | 'contract',
  download: boolean = false
): Promise<{ blob: Blob; mimeType: string }> {
  const token = storageService.getAuthToken();
  const url = `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(docType)}${download ? '?download=true' : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load document (${res.status} ${res.statusText})`);
  }

  const mimeType = res.headers.get('content-type') || 'application/octet-stream';
  const blob = await res.blob();
  return { blob, mimeType };
}

/**
 * Opens a document in preview mode (in a new tab or via Blob URL / Server API)
 */
export function openDocumentPreview(
  projectId: string,
  doc: ProjectDocument | any,
  docType: 'proposal' | 'contract'
): void {
  const normalized = normalizeDocument(doc);
  if (!normalized) {
    console.warn('[openDocumentPreview] No valid document found to preview.');
    return;
  }

  // 1. If document has an external link (Google Drive, Dropbox, OneDrive)
  if (normalized.externalUrl && !normalized.url) {
    window.open(normalized.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // 2. If document has a Base64 Data URL, convert to Blob URL for clean browser preview
  if (normalized.url && normalized.url.startsWith('data:')) {
    const blobResult = base64ToBlob(normalized.url);
    if (blobResult) {
      const blobUrl = URL.createObjectURL(blobResult.blob);
      const newWin = window.open(blobUrl, '_blank');
      if (newWin) {
        // Automatically revoke object URL after window loads
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 60000);
        return;
      }
    }
  }

  // 3. Fallback to secure server API route:
  // Open blank tab immediately to satisfy pop-up blockers, fetch with JWT token, then redirect to blob URL
  const newWin = window.open('', '_blank');
  if (newWin) {
    try {
      newWin.document.title = 'Loading document...';
    } catch {
      // Ignore cross-origin / iframe restrictions
    }
  }

  fetchAuthenticatedDocumentBlob(projectId, docType, false)
    .then(({ blob }) => {
      const blobUrl = URL.createObjectURL(blob);
      if (newWin && !newWin.closed) {
        newWin.location.href = blobUrl;
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      } else {
        URL.revokeObjectURL(blobUrl);
      }
    })
    .catch((err) => {
      console.error('[openDocumentPreview] Failed to fetch document:', err);
      if (newWin && !newWin.closed) {
        newWin.close();
      }
      alert('Failed to load document. Please ensure you are logged in and have access.');
    });
}

/**
 * Securely triggers instant download with the original filename and extension intact
 */
export function downloadDocument(
  projectId: string,
  doc: ProjectDocument | any,
  docType: 'proposal' | 'contract'
): void {
  const normalized = normalizeDocument(doc);
  const fallbackFileName =
    normalized?.name || `${projectId}_${docType === 'proposal' ? 'Proposal' : 'Contract'}.pdf`;

  // 1. If document has a Base64 data URL, download directly via Blob to avoid server latency
  if (normalized?.url && normalized.url.startsWith('data:')) {
    const blobResult = base64ToBlob(normalized.url);
    if (blobResult) {
      const blobUrl = URL.createObjectURL(blobResult.blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fallbackFileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 10000);
      return;
    }
  }

  // 2. If it's an external URL only, open it
  if (normalized?.externalUrl && !normalized?.url) {
    window.open(normalized.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // 3. Trigger download via server endpoint with authenticated fetch and Blob
  fetchAuthenticatedDocumentBlob(projectId, docType, true)
    .then(({ blob }) => {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fallbackFileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 10000);
    })
    .catch((err) => {
      console.error('[downloadDocument] Download failed:', err);
      alert('Failed to download document. Please ensure you are logged in and have access.');
    });
}
