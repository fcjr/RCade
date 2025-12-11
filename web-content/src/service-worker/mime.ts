const mimeTypes = {
    // Text
    'txt': 'text/plain',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv',

    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',

    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'aac': 'audio/aac',

    // Video
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'webm': 'video/webm',
    'ogv': 'video/ogg',
    'avi': 'video/x-msvideo',

    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Archives
    'zip': 'application/zip',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    '7z': 'application/x-7z-compressed',
    'rar': 'application/vnd.rar',

    // Fonts
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'eot': 'application/vnd.ms-fontobject',

    // Web Assembly & Binary
    'wasm': 'application/wasm',
    'bin': 'application/octet-stream',

    // Programming Languages
    'ts': 'text/typescript',
    'tsx': 'text/tsx',
    'jsx': 'text/jsx',
    'py': 'text/x-python',
    'java': 'text/x-java-source',
    'c': 'text/x-c',
    'cpp': 'text/x-c++',
    'h': 'text/x-c',
    'hpp': 'text/x-c++',
    'rs': 'text/x-rust',
    'go': 'text/x-go',
    'php': 'text/x-php',
    'rb': 'text/x-ruby',
    'sh': 'application/x-sh',
    'bash': 'application/x-sh',

    // Data formats
    'yaml': 'application/x-yaml',
    'yml': 'application/x-yaml',
    'toml': 'application/toml',
    'md': 'text/markdown',
    'markdown': 'text/markdown',

    // 3D & Graphics
    'glb': 'model/gltf-binary',
    'gltf': 'model/gltf+json',
    'obj': 'model/obj',
    'stl': 'model/stl',

    // Ebooks
    'epub': 'application/epub+zip',
    'mobi': 'application/x-mobipocket-ebook',

    // Misc
    'swf': 'application/x-shockwave-flash',
    'apk': 'application/vnd.android.package-archive',
    'dmg': 'application/x-apple-diskimage',
    'exe': 'application/x-msdownload',
    'iso': 'application/x-iso9660-image',
};

export function getMimeType(filepath: string) {
    const ext = filepath.toLowerCase().split('.').pop();

    return mimeTypes[ext as keyof typeof mimeTypes] || 'application/octet-stream';
}