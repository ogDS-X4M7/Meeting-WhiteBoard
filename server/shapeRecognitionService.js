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
      } else if (this.isDiamond(points, boundingBox, aspectRatio)) {
        return {
          type: 'diamond',
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
    if (aspectRatio < 0.5 || aspectRatio > 2.0 || points.length <= 4) {
      return false;
    }

    // 检测水平和垂直线条
    const horizontalVerticalScore = this.detectHorizontalVerticalLines(points);

    // 矩形应该有明显的水平和垂直线条
    return horizontalVerticalScore > points.length * 0.4;
  }

  // 检测水平和垂直线条
  detectHorizontalVerticalLines(points) {
    let score = 0;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // 计算线段的角度
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;

      // 检查是否接近水平或垂直
      // 水平：0度或180度
      // 垂直：90度或270度
      if (Math.abs(angle) < 15 || Math.abs(angle - 180) < 15 ||
        Math.abs(angle - 90) < 15 || Math.abs(angle - 270) < 15) {
        score++;
      }
    }

    return score;
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

  // 判断是否为菱形
  isDiamond(points, boundingBox, aspectRatio) {
    // 检查点的数量和长宽比
    if (points.length < 4) return false;

    // 计算中心点
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;

    // 计算四个顶点
    const topPoint = { x: centerX, y: boundingBox.y };
    const rightPoint = { x: boundingBox.x + boundingBox.width, y: centerY };
    const bottomPoint = { x: centerX, y: boundingBox.y + boundingBox.height };
    const leftPoint = { x: boundingBox.x, y: centerY };

    // 检查点是否围绕中心点对称
    let symmetryScore = 0;
    let diagonalScore = 0;

    for (const point of points) {
      // 检查点是否接近菱形的四个顶点之一
      const distances = [
        this.calculateDistance(point, topPoint),
        this.calculateDistance(point, rightPoint),
        this.calculateDistance(point, bottomPoint),
        this.calculateDistance(point, leftPoint)
      ];
      const minDistance = Math.min(...distances);
      if (minDistance < boundingBox.width * 0.35) { // 增大阈值，降低识别难度
        symmetryScore++;
      }

      // 检查点是否位于菱形的对角线上（这是菱形的重要特征）
      const distanceToHorizontalCenter = Math.abs(point.y - centerY);
      const distanceToVerticalCenter = Math.abs(point.x - centerX);
      if (distanceToHorizontalCenter > 0) {
        const diagonalRatio = distanceToVerticalCenter / distanceToHorizontalCenter;
        if (diagonalRatio > 0.4 && diagonalRatio < 1.6) { // 放宽范围，降低识别难度
          diagonalScore++;
        }
      }
    }

    // 检测水平和垂直线条，菱形应该较少
    const horizontalVerticalScore = this.detectHorizontalVerticalLines(points);

    // 菱形的特征：
    // 1. 点集中在四个顶点和对角线上
    // 2. 水平和垂直线条较少
    // 3. 长宽比在合理范围内
    return symmetryScore > points.length * 0.25 && // 降低分数要求
      diagonalScore > points.length * 0.15 && // 降低分数要求
      horizontalVerticalScore < points.length * 0.4 && // 放宽限制
      aspectRatio > 0.3 && aspectRatio < 3.0; // 放宽长宽比范围
  }

  // 计算数组的方差
  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
    return squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
  }

  // 计算两点之间的距离
  calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
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
      case 'diamond':
        return {
          type: 'diamond',
          startX: shape.x,
          startY: shape.y,
          lastX: shape.x + shape.width,
          lastY: shape.y + shape.height
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