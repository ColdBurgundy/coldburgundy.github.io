// static/js/toc-sidebar.js (좌표 수정 버전)

function initTocSidebar(tocElement, contentElement) {

  var toc = tocElement;
  var tocPath = tocElement.querySelector('.toc-marker path');
  var tocItems;

  var TOP_MARGIN = 0.1,
      BOTTOM_MARGIN = 0.2;

  var pathLength;
  var lastPathStart,
      lastPathEnd;

  contentElement.addEventListener('scroll', sync, false);
  
  // .toc 요소 자체의 스크롤도 마커를 다시 그리도록 합니다.
  tocElement.addEventListener('scroll', drawPath, false); 
  
  drawPath();

  function drawPath() {
    
    tocItems = [].slice.call(toc.querySelectorAll('li'));

    // .toc 요소(SVG의 부모)의 "절대" 화면 위치를 가져옵니다.
    var tocRect = toc.getBoundingClientRect();

    tocItems = tocItems.map(function (item) {
      var anchor = item.querySelector('a');
      var targetId = anchor.getAttribute('href').slice(1);
      var target = contentElement.querySelector('#' + targetId); 

      return {
        listItem: item,
        anchor: anchor,
        target: target
      };
    });

    tocItems = tocItems.filter(function (item) {
      return !!item.target;
    });

    var path = [];
    var pathIndent;

    tocItems.forEach(function (item, i) {

      // --- [핵심 수정] ---
      // 앵커(<a>)의 화면상 위치를 가져옵니다.
      var anchorRect = item.anchor.getBoundingClientRect();
      
      // x = (앵커의 화면 왼쪽 좌표 - .toc의 화면 왼쪽 좌표)
      var x = anchorRect.left - tocRect.left;
      
      // y = (앵커의 화면 위쪽 좌표 - .toc의 화면 위쪽 좌표) + ".toc가 스크롤된 거리"
      // (사이드바가 스크롤되었을 때의 실제 y좌표를 계산합니다)
      var y = (anchorRect.top - tocRect.top) + toc.scrollTop;
      
      // 텍스트 왼쪽에 선을 긋기 위한 오프셋 (5px)
      x -= 5; 
      
      var height = item.anchor.offsetHeight;
      // --- [수정 끝] ---

      if (i === 0) {
        path.push('M', x, y, 'L', x, y + height);
        item.pathStart = 0;
      }
      else {
        if (pathIndent !== x) path.push('L', pathIndent, y);
        path.push('L', x, y);
        tocPath.setAttribute('d', path.join(' '));
        item.pathStart = tocPath.getTotalLength() || 0;
        path.push('L', x, y + height);
      }
      
      pathIndent = x;
      tocPath.setAttribute('d', path.join(' '));
      item.pathEnd = tocPath.getTotalLength();
    });
    
    pathLength = tocPath.getTotalLength();
    sync();
  }

  function sync() {
    
    var windowHeight = contentElement.clientHeight;
    
    var pathStart = pathLength,
        pathEnd = 0;
    
    var visibleItems = 0;
    
    tocItems.forEach(function (item) {

      var containerBounds = contentElement.getBoundingClientRect();
      var targetBounds = item.target.getBoundingClientRect();
      
      var top = targetBounds.top - containerBounds.top;
      var bottom = targetBounds.bottom - containerBounds.top;
      
      if (bottom > windowHeight * TOP_MARGIN && top < windowHeight * (1 - BOTTOM_MARGIN)) {
        pathStart = Math.min(item.pathStart, pathStart);
        pathEnd = Math.max(item.pathEnd, pathEnd);
        visibleItems += 1;
        item.listItem.classList.add('visible');
      }
      else {
        item.listItem.classList.remove('visible');
      }
    });
    
    if (visibleItems > 0 && pathStart < pathEnd) {
      if (pathStart !== lastPathStart || pathEnd !== lastPathEnd) {
        tocPath.setAttribute('stroke-dashoffset', '1');
        tocPath.setAttribute('stroke-dasharray', '1, ' + pathStart + ', ' + (pathEnd - pathStart) + ', ' + pathLength);
        tocPath.setAttribute('opacity', 1);
      }
    }
    else {
      tocPath.setAttribute('opacity', 0);
    }
    
    lastPathStart = pathStart;
    lastPathEnd = pathEnd;
  }
}