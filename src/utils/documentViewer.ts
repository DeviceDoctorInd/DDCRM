import { ProjectDocument } from '../types/crm';

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

  // 3. Fallback to secure server API route which serves the file inline
  const serverUrl = `/api/projects/${encodeURIComponent(projectId)}/documents/${docType}`;
  window.open(serverUrl, '_blank', 'noopener,noreferrer');
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
      }, 5000);
      return;
    }
  }

  // 2. If it's an external URL only, open it
  if (normalized?.externalUrl && !normalized?.url) {
    window.open(normalized.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // 3. Trigger download via server endpoint with ?download=true
  const downloadUrl = `/api/projects/${encodeURIComponent(projectId)}/documents/${docType}?download=true`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fallbackFileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
