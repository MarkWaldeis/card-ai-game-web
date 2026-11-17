async function loadSplitPack(packName, onProgress) {
  const manifestResponse = await fetch(packName + '.manifest.json');
  if (!manifestResponse.ok) throw new Error('Cannot load pack manifest: HTTP ' + manifestResponse.status);
  const manifest = await manifestResponse.json();
  if (!manifest || manifest.version !== 1 || !Number.isSafeInteger(manifest.size) ||
      manifest.size <= 0 || manifest.size > 200000000 ||
      !Array.isArray(manifest.parts) || manifest.parts.length === 0 ||
      manifest.part_count !== manifest.parts.length ||
      manifest.parts.some((part, index) => !part || part.file !== packName + '.part' + index ||
        !Number.isSafeInteger(part.size) || part.size <= 0 || part.size > 90000000) ||
      manifest.parts.reduce((sum, part) => sum + part.size, 0) !== manifest.size) {
    throw new Error('Invalid pack manifest');
  }
  const pack = new Uint8Array(manifest.size);
  let offset = 0;
  onProgress(0, manifest.size);
  for (const part of manifest.parts) {
    const response = await fetch(part.file);
    if (!response.ok) throw new Error('Cannot load ' + part.file + ': HTTP ' + response.status);
    let received = 0;
    function append(chunk) {
      if (received + chunk.byteLength > part.size) throw new Error('Oversized pack part: ' + part.file);
      pack.set(chunk, offset + received);
      received += chunk.byteLength;
      onProgress(offset + received, manifest.size);
    }
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          append(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
    } else {
      append(new Uint8Array(await response.arrayBuffer()));
    }
    if (received !== part.size) throw new Error('Incomplete pack part: ' + part.file);
    offset += received;
  }
  return pack.buffer;
}
