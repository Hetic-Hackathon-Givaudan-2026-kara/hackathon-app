type Question = { id: number; question: string; answer: string };

const health = document.querySelector('#health')!;
const list = document.querySelector('#questions')!;

async function refresh() {
  const status = await fetch('/api/health').then((r) => r.json());
  health.textContent = `API OK · ${status.db}`;

  const questions: Question[] = await fetch('/api/questions').then((r) =>
    r.json(),
  );
  list.replaceChildren(
    ...questions.map((q) => {
      const item = document.createElement('li');
      item.textContent = `${q.question} → ${q.answer}`;
      return item;
    }),
  );
}

refresh();