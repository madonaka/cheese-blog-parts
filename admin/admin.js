// admin/admin.js

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('quiz-test-form');
  if (!form) return; // 아직 섹션 안 만들었으면 그냥 종료

  const apiInput    = document.getElementById('quiz-api-url');
  const limitInput  = document.getElementById('quiz-limit');
  const periodInput = document.getElementById('quiz-period');
  const topicInput  = document.getElementById('quiz-topic');
  const resultBox   = document.getElementById('quiz-test-result');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiUrl = (apiInput.value || '').trim();
    if (!apiUrl) {
      alert('API URL을 입력해 주세요.');
      return;
    }

    const params = new URLSearchParams();
    const limit  = (limitInput.value || '').trim() || '5';
    params.set('limit', limit);

    const period = (periodInput.value || '').trim();
    const topic  = (topicInput.value || '').trim();

    if (period) params.set('period', period);
    if (topic)  params.set('topic', topic);

    const url = apiUrl + '?' + params.toString();

    resultBox.textContent = '불러오는 중...';

    try {
      const res = await fetch(url);
      const data = await res.json();

      // 보기 좋게 포맷해서 보여주기
      resultBox.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      console.error(err);
      resultBox.textContent = '에러: ' + err.message;
    }
  });
});

