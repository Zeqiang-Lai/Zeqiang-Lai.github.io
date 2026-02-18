---
layout: page
permalink: /publications/
title: Publications
description: The year indicates the time when the work is mostly finished. <br> * indicates equal contribution. \# indicates corresponding author, † indicates project lead.
years: [2026,2025,2024,2023,2022,2021]
nav: true
nav_order: 1
---
<!-- _pages/publications.md -->

<style>
.pub-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.pub-toggle .btn {
  padding: 2px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  box-shadow: none;
  transition: all 0.2s ease;
  margin: 0;
}
.pub-toggle .btn.active {
  background: #333;
  color: #fff;
  border-color: #333;
}
.pub-toggle .btn:hover:not(.active) {
  background: #f0f0f0;
}
</style>

<div class="pub-toggle">
  <button class="btn active" data-filter="paper" onclick="togglePubType('paper')">Papers</button>
  <button class="btn" data-filter="report" onclick="togglePubType('report')">Reports</button>
</div>

<div class="publications">

{%- for y in page.years %}
  <h3 class="year">{{y}}</h3>
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}

</div>

<script>
function togglePubType(type) {
  // 更新按钮状态
  document.querySelectorAll('.pub-toggle .btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  document.querySelector('.pub-toggle .btn[data-filter="' + type + '"]').classList.add('active');

  var publications = document.querySelector('.publications');
  var items = publications.querySelectorAll('.row');
  var years = publications.querySelectorAll('h3.year');

  // 根据类型过滤条目
  items.forEach(function(item) {
    var isReport = item.getAttribute('data-report') === 'true';
    if (type === 'report') {
      item.closest('li').style.display = isReport ? '' : 'none';
    } else {
      item.closest('li').style.display = isReport ? 'none' : '';
    }
  });

  // 隐藏没有可见条目的年份标题
  years.forEach(function(yearEl) {
    var nextEl = yearEl.nextElementSibling;
    var hasVisible = false;
    while (nextEl && nextEl.tagName !== 'H3') {
      if (nextEl.tagName === 'OL' || nextEl.tagName === 'UL') {
        var listItems = nextEl.querySelectorAll('li');
        listItems.forEach(function(li) {
          if (li.style.display !== 'none') {
            hasVisible = true;
          }
        });
      }
      nextEl = nextEl.nextElementSibling;
    }
    yearEl.style.display = hasVisible ? '' : 'none';
  });
}

// 页面加载后默认显示 paper
document.addEventListener('DOMContentLoaded', function() {
  togglePubType('paper');
});
</script>
