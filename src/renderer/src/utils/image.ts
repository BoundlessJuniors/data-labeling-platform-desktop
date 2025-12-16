export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = url.startsWith('http') ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url
  })
}
