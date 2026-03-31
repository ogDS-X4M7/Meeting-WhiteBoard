// 图形识别服务

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

        // // 计算所有点到中心点的平均距离，作为半径
        // let totalDistance = 0;
        // for (const point of points) {
        //   const distance = Math.sqrt(Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2));
        //   totalDistance += distance;
        // }

        // // 使用平均距离作为半径，确保美化后的圆形大小与用户绘制的一致
        // const radius = totalDistance / points.length;
        const radius = boundingBox.width / 2;
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
    if (aspectRatio < 0.2 || aspectRatio > 5.0 || points.length <= 4) {
      return false;
    }

    // 检测水平和垂直线条
    const horizontalVerticalScore = this.detectHorizontalVerticalLines(points);

    // 矩形应该有明显的水平和垂直线条
    return horizontalVerticalScore > points.length * 0.6;
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
    // 检查点的数量
    if (points.length < 3) return false;

    // 简化箭头识别逻辑
    // 1. 计算起点到终点的距离
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const distance = this.calculateDistance(startPoint, endPoint);

    // 2. 计算所有点到起点-终点连线的平均距离
    let totalDistance = 0;
    for (const point of points) {
      totalDistance += this.distanceToLine(point, startPoint, endPoint);
    }
    const avgDistance = totalDistance / points.length;

    // 3. 箭头的特征：大部分点应该靠近起点-终点连线
    // 平均距离与总距离的比例应该较小
    const distanceRatio = avgDistance / (distance + 0.001);

    // 4. 允许0-2个方向变化，降低识别难度
    // let directionChanges = 0;
    // for (let i = 1; i < points.length - 1; i++) {
    //   const p1 = points[i - 1];
    //   const p2 = points[i];
    //   const p3 = points[i + 1];

    //   const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    //   const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    //   const angleDiff = Math.abs(angle1 - angle2);

    //   if (angleDiff > Math.PI / 6) { // 放宽角度差阈值
    //     directionChanges++;
    //   }
    // }

    // 箭头的特征：
    // 1. 平均距离与总距离的比例较小（点靠近连线）
    // 2. 方向变化次数在0-2之间
    // return distanceRatio < 0.3 && directionChanges <= 2;
    return distanceRatio < 0.3
  }

  // 计算点到直线的距离
  distanceToLine(point, lineStart, lineEnd) {
    const A = lineEnd.y - lineStart.y;
    const B = lineStart.x - lineEnd.x;
    const C = lineEnd.x * lineStart.y - lineStart.x * lineEnd.y;
    return Math.abs(A * point.x + B * point.y + C) / Math.sqrt(A * A + B * B);
  }

  // 判断是否为菱形
  isDiamond(points, boundingBox, aspectRatio) {
    // 检查点的数量和长宽比
    if (points.length < 4) return false;

    // 计算标准菱形中心点
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;

    // 计算标准菱形四个顶点（底部可以不用算）
    const topPoint = { x: centerX, y: boundingBox.y };
    const rightPoint = { x: boundingBox.x + boundingBox.width, y: centerY };
    const leftPoint = { x: boundingBox.x, y: centerY };
    // 标准菱形系数：只有正负两种，还是相反数，因此算一个就够用了;
    const k = (topPoint.y - leftPoint.y) / (topPoint.x - leftPoint.x);
    // 预期距离阈值，以对角线平均值的0.15为参考
    const inDistance = (boundingBox.width + boundingBox.height) / 2 * 0.2;

    // 根据标准菱形的四个顶点，生成标准菱形四条边的坐标函数
    const edges = (x, y) => {
      let distance;
      if (x >= topPoint.x) {
        let dist1 = Math.abs(k * (x - leftPoint.x) + leftPoint.y - y);
        let dist2 = Math.abs(-k * (x - leftPoint.x) + leftPoint.y - y);
        distance = Math.min(dist1, dist2);
      } else {
        let dist1 = Math.abs(k * (rightPoint.x - x) + rightPoint.y - y);
        let dist2 = Math.abs(-k * (rightPoint.x - x) + rightPoint.y - y);
        distance = Math.min(dist1, dist2);
      }
      return distance < inDistance;
    }

    // 检查点是否接近标准菱形
    let symmetryScore = 0;

    for (const point of points) {
      if (edges(point.x, point.y)) {
        symmetryScore++;
      }
    }
    // 检测水平和垂直线条，菱形应该较少
    const horizontalVerticalScore = this.detectHorizontalVerticalLines(points);
    return symmetryScore > points.length * 0.35 &&
      horizontalVerticalScore < points.length * 0.4;
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