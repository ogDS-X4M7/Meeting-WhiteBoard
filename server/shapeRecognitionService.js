// 图形识别服务
// 由于OpenCV在Windows环境下安装复杂，这里提供一个基于几何算法的模拟实现

class ShapeRecognitionService {
  constructor() {
    // 初始化服务
  }

  // 识别手绘图形
  recognizeShape(points) {
    try {
      // 计算图形的基本属性
      const center = this.calculateCenter(points);
      const boundingBox = this.calculateBoundingBox(points);
      const area = this.calculateArea(points);
      const perimeter = this.calculatePerimeter(points);
      const aspectRatio = (boundingBox.width / boundingBox.height);

      // 基于几何特征识别图形
      if (this.isCircle(points, center, area, perimeter)) {
        // 计算中心点
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;
        
        // 计算所有点到中心点的最大距离，作为半径
        let maxDistance = 0;
        for (const point of points) {
          const distance = Math.sqrt(Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2));
          if (distance > maxDistance) {
            maxDistance = distance;
          }
        }
        
        // 使用最大距离作为半径，确保美化后的圆形大小与用户绘制的一致
        const radius = maxDistance;
        return {
          type: 'circle',
          center: { x: centerX, y: centerY },
          radius: radius,
          confidence: 0.9
        };
      } else if (this.isRectangle(points, boundingBox, aspectRatio)) {
        return {
          type: 'rectangle',
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
          confidence: 0.85
        };
      } else if (this.isArrow(points)) {
        return {
          type: 'arrow',
          start: points[0],
          end: points[points.length - 1],
          confidence: 0.8
        };
      } else {
        return {
          type: 'pen',
          points: points,
          confidence: 1.0
        };
      }
    } catch (error) {
      console.error('Error recognizing shape:', error);
      return {
        type: 'pen',
        points: points,
        confidence: 1.0
      };
    }
  }

  // 计算中心点
  calculateCenter(points) {
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return { x, y };
  }

  // 计算边界框
  calculateBoundingBox(points) {
    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  // 计算面积（使用 shoelace 公式）
  calculateArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      area += (p1.x * p2.y) - (p2.x * p1.y);
    }
    return Math.abs(area) / 2;
  }

  // 计算周长
  calculatePerimeter(points) {
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      perimeter += distance;
    }
    return perimeter;
  }

  // 判断是否为圆形
  isCircle(points, center, area, perimeter) {
    // 计算圆的理论周长
    const radius = Math.sqrt(area / Math.PI);
    const expectedPerimeter = 2 * Math.PI * radius;
    
    // 检查周长与理论值的差异
    const perimeterRatio = perimeter / expectedPerimeter;
    return perimeterRatio > 0.8 && perimeterRatio < 1.2;
  }

  // 判断是否为矩形
  isRectangle(points, boundingBox, aspectRatio) {
    // 检查边界框的长宽比和点的分布
    return aspectRatio > 0.5 && aspectRatio < 2.0 && points.length > 4;
  }

  // 判断是否为箭头
  isArrow(points) {
    // 检查点的数量和方向变化
    if (points.length < 3) return false;
    
    // 计算方向变化
    let directionChanges = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];
      
      const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
      const angleDiff = Math.abs(angle1 - angle2);
      
      if (angleDiff > Math.PI / 4) {
        directionChanges++;
      }
    }
    
    return directionChanges === 1; // 箭头通常有一个方向变化
  }

  // 美化图形
  beautifyShape(shape) {
    switch (shape.type) {
      case 'circle':
        return {
          type: 'circle',
          startX: shape.center.x - shape.radius,
          startY: shape.center.y - shape.radius,
          lastX: shape.center.x + shape.radius,
          lastY: shape.center.y + shape.radius
        };
      case 'rectangle':
        return {
          type: 'rectangle',
          startX: shape.x,
          startY: shape.y,
          lastX: shape.x + shape.width,
          lastY: shape.y + shape.height
        };
      case 'arrow':
        return {
          type: 'arrow',
          startX: shape.start.x,
          startY: shape.start.y,
          lastX: shape.end.x,
          lastY: shape.end.y
        };
      default:
        return shape;
    }
  }
}

module.exports = ShapeRecognitionService;