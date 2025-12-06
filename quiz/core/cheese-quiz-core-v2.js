/*!
 * Cheese Quiz Core v2 (from Blogger inline script)
 * - Google Apps Script에서 문제를 가져와 랜덤 퀴즈를 렌더링
 * - .cheese-quiz 컨테이너를 1개 기대
 */

document.addEventListener('DOMContentLoaded', async function() {
  const quizBox = document.querySelector('.cheese-quiz');
  if (!quizBox) return;

  const api = quizBox.dataset.api || 'https://script.google.com/macros/s/AKfycbwuvooqtlk6c_Nv2_VgforohP5twqTLWGu5j8uf56D3qvKsUnioAhfbkNdTKIsQaaQF/exec';
  const limit = quizBox.dataset.limit || '5';
  const period = quizBox.dataset.period || '';
  const topic = quizBox.dataset.topic || '';
  const diff = quizBox.dataset.difficulty || '';

  const url = `${api}?limit=${limit}&period=${period}&topic=${topic}&difficulty=${diff}`;
  console.log('[CheeseQuiz]', url);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      quizBox.innerHTML = '<p>문제를 불러올 수 없습니다.</p>';
      return;
    }

    const ol = quizBox.querySelector('#cheese-quiz-bank');
    data.forEach((q, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<p>${idx + 1}. ${q.question}</p>` +
        q.choices.map((c, i) => `
          <label style="display:block">
            <input type="radio" name="q${idx}" value="${i+1}">
            ${c}
          </label>`).join('');
      li.dataset.answer = q.answer;
      ol.appendChild(li);
    });

    const checkBtn = quizBox.querySelector('.cheese-quiz-check');
    const resetBtn = quizBox.querySelector('.cheese-quiz-reset');
    const resultBox = quizBox.querySelector('.cheese-quiz-result');

    checkBtn.addEventListener('click', () => {
      let correct = 0;
      const items = quizBox.querySelectorAll('#cheese-quiz-bank li');
      items.forEach(li => {
        const checked = li.querySelector('input:checked');
        if (checked && Number(checked.value) === Number(li.dataset.answer)) correct++;
      });
      resultBox.textContent = `정답 ${correct} / ${data.length}개 (${Math.round(correct/data.length*100)}점)`;
    });

    resetBtn.addEventListener('click', () => {
      quizBox.querySelectorAll('input[type="radio"]').forEach(i => i.checked = false);
      resultBox.textContent = '';
    });

  } catch (err) {
    console.error(err);
    quizBox.innerHTML = '<p>문제를 불러오는 중 오류 발생.</p>';
  }
});
