export const classicBoard = 560
export const sidebarWidth = 140
export const reconHeight = 40

export function viewport(worldWidth, worldHeight, availableWidth, availableHeight, overview = false) {
  const referenceScale = Math.min(availableWidth / (classicBoard + sidebarWidth),
    availableHeight / (classicBoard + reconHeight))
  const compact = worldWidth <= classicBoard && worldHeight <= classicBoard
  const scale = compact ? referenceScale : Math.min(1, referenceScale)
  let width = Math.min(Math.max(classicBoard,worldWidth),Math.max(classicBoard,Math.floor(availableWidth / scale - sidebarWidth)))
  let height = Math.min(Math.max(classicBoard,worldHeight),Math.max(classicBoard,Math.floor(availableHeight / scale - reconHeight)))
  const fit = Math.min(width / worldWidth,height / worldHeight)
  if (overview) {
    width = Math.min(width,Math.max(classicBoard,Math.ceil(worldWidth*fit)))
    height = Math.min(height,Math.max(classicBoard,Math.ceil(worldHeight*fit)))
  }
  const screenWidth = width + sidebarWidth, screenHeight = height + reconHeight
  const displayScale = Math.min(availableWidth / screenWidth,availableHeight / screenHeight)
  return {
    width,height,screenWidth,screenHeight,
    displayWidth:screenWidth * displayScale, displayHeight:screenHeight * displayScale,
    fit,
  }
}
