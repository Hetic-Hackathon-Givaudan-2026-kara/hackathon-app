import {
  checkApiHealth,
  createSample,
  getSample,
  searchCatalog,
} from '../services/api';
import { SpeechInput } from '../services/speech';
import type {
  CatalogMatch,
  CatalogSearchResponse,
  Qualification,
  SampleRequest,
  SampleStatus,
} from '../types';

const sampleStatuses: SampleStatus[] = ['Demandé', 'Préparé', 'Expédié'];

export class ChatInterface {
  private readonly conversation: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly microphoneButton: HTMLButtonElement;
  private readonly voiceStatus: HTMLElement;
  private readonly apiStatus: HTMLElement;
  private readonly progress: HTMLProgressElement;
  private readonly progressLabel: HTMLElement;
  private readonly progressCaption: HTMLElement;
  private readonly matches: HTMLElement;
  private readonly refinements: HTMLElement;
  private readonly refinementQuestion: HTMLElement;
  private readonly tracking: HTMLElement;
  private readonly dialog: HTMLDialogElement;
  private readonly sampleForm: HTMLFormElement;
  private readonly sampleReference: HTMLElement;
  private readonly sampleError: HTMLElement;
  private readonly expertSummary: HTMLElement;
  private readonly expertText: HTMLTextAreaElement;
  private readonly expertStatus: HTMLElement;
  private readonly speech: SpeechInput;
  private currentPrompt = '';
  private currentResult: CatalogSearchResponse | null = null;
  private currentSample: SampleRequest | null = null;
  private selectedMatch: CatalogMatch | null = null;
  private pendingRefinementQuestion = '';
  private voicePrefix = '';
  private busy = false;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="smartorder-app">
        <header class="topbar">
          <a class="brand" href="/" aria-label="Givaudan SmartOrder, accueil">
            <span class="brand-mark" aria-hidden="true">G</span>
            <span class="brand-name"><strong>Givaudan</strong><small>SMARTORDER</small></span>
          </a>
          <div class="topbar-meta">
            <span class="workspace-pill">Espace professionnel</span>
            <span class="api-status is-loading" id="api-status" role="status">
              <span class="status-dot" aria-hidden="true"></span>
              Connexion à l’API…
            </span>
          </div>
        </header>

        <main class="workspace">
          <section class="conversation-panel" aria-labelledby="chat-title">
            <div class="section-kicker"><span>01</span> EXPLORATION SENSORIELLE</div>
            <div class="chat-heading">
              <div>
                <h1 id="chat-title">Le bon profil, en quelques mots.</h1>
                <p>Décrivez votre idée. Nous affinons ensemble la sélection.</p>
              </div>
              <span class="ai-chip"><span aria-hidden="true">✦</span> Assistant IA</span>
            </div>

            <div class="conversation" id="conversation" aria-live="polite" aria-relevant="additions">
              <article class="message message-assistant">
                <span class="message-avatar" aria-hidden="true">G</span>
                <div class="message-content">
                  <span class="message-author">Votre conseiller SmartOrder</span>
                  <div class="message-bubble">
                    <p>Bonjour ! Quel profil d’arôme ou de fragrance recherchez-vous ?</p>
                    <div class="starter-prompts" id="starter-prompts">
                      <button type="button" data-prompt="Une vanille douce et crémeuse pour une boisson prête à boire">
                        <span aria-hidden="true">☼</span> Vanille crémeuse
                      </button>
                      <button type="button" data-prompt="Un agrume frais et pétillant pour une boisson">
                        <span aria-hidden="true">◌</span> Agrume pétillant
                      </button>
                      <button type="button" data-prompt="Une fragrance florale et boisée, élégante et naturelle">
                        <span aria-hidden="true">✿</span> Floral & boisé
                      </button>
                    </div>
                  </div>
                  <time class="message-time">À l’instant</time>
                </div>
              </article>
            </div>

            <form class="chat-composer" id="chat-form">
              <label class="sr-only" for="chat-input">Décrivez votre besoin</label>
              <textarea
                id="chat-input"
                name="query"
                rows="1"
                placeholder="Ex. une note de pêche fraîche, pas trop sucrée…"
                required
              ></textarea>
              <div class="composer-footer">
                <span class="voice-status" id="voice-status" role="status">
                  Recherche en français ou dictez votre idée
                </span>
                <div class="composer-actions">
                  <button
                    class="icon-button microphone-button"
                    id="microphone-button"
                    type="button"
                    aria-label="Démarrer la dictée vocale"
                    aria-pressed="false"
                    title="Dicter votre demande"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="2.75" width="6" height="12" rx="3"></rect>
                      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.25M9 21.25h6"></path>
                    </svg>
                  </button>
                  <button class="send-button" id="send-button" type="submit">
                    <span>Rechercher</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M3.5 10h12m-5-5 5 5-5 5"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </form>
            <p class="privacy-note"><span aria-hidden="true">◇</span> Vos échanges servent uniquement à affiner cette sélection.</p>
          </section>

          <aside class="results-panel" aria-label="Sélection et suivi">
            <section class="precision-card" aria-labelledby="precision-title">
              <div class="precision-heading">
                <div>
                  <div class="section-kicker"><span>02</span> VOTRE BRIEF</div>
                  <h2 id="precision-title">Précision du brief</h2>
                </div>
                <span class="precision-value" id="progress-label">18%</span>
              </div>
              <progress id="precision-progress" max="100" value="18" aria-label="Précision du brief"></progress>
              <p id="progress-caption">Ajoutez quelques détails pour affiner la sélection.</p>
            </section>

            <section class="matches-section" aria-labelledby="matches-title">
              <div class="results-heading">
                <div>
                  <div class="section-kicker"><span>03</span> SÉLECTION</div>
                  <h2 id="matches-title">Vos meilleures pistes</h2>
                </div>
                <span class="match-count">TOP 2</span>
              </div>
              <div class="matches-list" id="matches">
                <div class="empty-selection">
                  <span class="empty-orbit" aria-hidden="true">✦</span>
                  <p>Vos suggestions apparaîtront ici.</p>
                  <small>Chaque échange rend la sélection plus précise.</small>
                </div>
              </div>
              <div class="refinements" id="refinements" hidden>
                <p id="refinement-question"></p>
                <div class="refinement-actions">
                  <button type="button" data-application="Poudre à diluer">Poudre à diluer</button>
                  <button type="button" data-application="Prête à boire">Prête à boire</button>
                  <button class="refinement-skip" type="button" data-application="skip">Ignorer cette question</button>
                </div>
              </div>
            </section>

            <section class="tracking-section" id="tracking" aria-live="polite" hidden></section>

            <section class="expert-section">
              <div class="expert-copy">
                <span class="expert-icon" aria-hidden="true">↗</span>
                <div>
                  <h2>Un projet à préciser ?</h2>
                  <p>Préparez un brief clair à partager avec l’équipe ADV.</p>
                </div>
              </div>
              <button class="expert-button" id="expert-button" type="button">Parler à un expert <span aria-hidden="true">→</span></button>
              <div class="expert-summary" id="expert-summary" hidden>
                <label for="expert-text">Récapitulatif de votre demande</label>
                <textarea id="expert-text" rows="8" readonly></textarea>
                <div class="summary-footer">
                  <span id="expert-status" role="status">Copiez ce brief pour votre équipe ADV.</span>
                  <button class="copy-button" id="copy-summary" type="button">Copier</button>
                </div>
              </div>
            </section>
          </aside>
        </main>

        <footer class="page-footer">
          <span>SmartOrder <span aria-hidden="true">·</span> Une exploration guidée des sens</span>
          <span>Givaudan <span aria-hidden="true">·</span> Taste & Wellbeing</span>
        </footer>

        <dialog class="sample-dialog" id="sample-dialog" aria-labelledby="sample-title">
          <div class="dialog-heading">
            <div>
              <div class="section-kicker"><span>ÉCHANTILLON</span></div>
              <h2 id="sample-title">Recevoir un échantillon</h2>
            </div>
            <button class="dialog-close" id="close-sample" type="button" aria-label="Fermer">×</button>
          </div>
          <p class="dialog-reference" id="sample-reference"></p>
          <form id="sample-form">
            <label>
              Nom du contact
              <input name="client_name" autocomplete="name" maxlength="100" placeholder="Votre nom" />
            </label>
            <label>
              Adresse de livraison
              <textarea name="shipping_address" autocomplete="street-address" rows="3" required placeholder="Adresse complète"></textarea>
            </label>
            <label class="quantity-label">
              Quantité
              <input name="quantity" type="number" min="1" step="1" value="1" required />
            </label>
            <p class="form-error" id="sample-error" role="alert"></p>
            <div class="dialog-actions">
              <button class="cancel-button" id="cancel-sample" type="button">Annuler</button>
              <button class="send-button" id="confirm-sample" type="submit">
                Confirmer la demande <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        </dialog>
      </div>
    `;

    this.conversation = requiredElement(root, '#conversation');
    this.input = requiredElement(root, '#chat-input');
    this.sendButton = requiredElement(root, '#send-button');
    this.microphoneButton = requiredElement(root, '#microphone-button');
    this.voiceStatus = requiredElement(root, '#voice-status');
    this.apiStatus = requiredElement(root, '#api-status');
    this.progress = requiredElement(root, '#precision-progress');
    this.progressLabel = requiredElement(root, '#progress-label');
    this.progressCaption = requiredElement(root, '#progress-caption');
    this.matches = requiredElement(root, '#matches');
    this.refinements = requiredElement(root, '#refinements');
    this.refinementQuestion = requiredElement(root, '#refinement-question');
    this.tracking = requiredElement(root, '#tracking');
    this.dialog = requiredElement(root, '#sample-dialog');
    this.sampleForm = requiredElement(root, '#sample-form');
    this.sampleReference = requiredElement(root, '#sample-reference');
    this.sampleError = requiredElement(root, '#sample-error');
    this.expertSummary = requiredElement(root, '#expert-summary');
    this.expertText = requiredElement(root, '#expert-text');
    this.expertStatus = requiredElement(root, '#expert-status');

    this.speech = new SpeechInput({
      onTranscript: (transcript) => {
        this.input.value = [this.voicePrefix, transcript]
          .filter(Boolean)
          .join(' ');
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
      },
      onListeningChange: (listening) => this.setListening(listening),
      onError: (message) => {
        this.voiceStatus.textContent = message;
        this.voiceStatus.classList.add('is-error');
      },
    });

    this.bindEvents();
    void this.refreshApiStatus();
  }

  private bindEvents(): void {
    const form = requiredElement<HTMLFormElement>(this.root, '#chat-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitPrompt(this.input.value);
    });

    requiredElement(this.root, '#starter-prompts').addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest<HTMLButtonElement>('[data-prompt]');
        if (button?.dataset.prompt)
          void this.submitPrompt(button.dataset.prompt);
      },
    );

    this.microphoneButton.addEventListener('click', () => {
      if (this.speech.isListening) {
        this.speech.stop();
      } else {
        this.voicePrefix = this.input.value.trim();
        this.voiceStatus.classList.remove('is-error');
        this.speech.start();
      }
    });

    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(this.input.scrollHeight, 160)}px`;
    });

    this.refinements.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(
        '[data-application]:not([hidden])',
      );
      if (!button?.dataset.application || !this.currentPrompt) return;

      const application = button.dataset.application;
      if (application === 'skip') {
        const qualification = this.currentResult?.qualification;
        if (!qualification) return;
        this.refinements.hidden = true;
        void this.submitPrompt(
          this.currentPrompt,
          'Je préfère ignorer cette question.',
          qualification,
        );
        return;
      }

      const query = `${this.currentPrompt}\nApplication souhaitée : ${application}.`;
      const message = `Application souhaitée : ${application}`;
      this.refinements.hidden = true;
      void this.submitPrompt(query, message);
    });

    requiredElement<HTMLButtonElement>(
      this.root,
      '#expert-button',
    ).addEventListener('click', () => void this.copySummary());
    requiredElement<HTMLButtonElement>(
      this.root,
      '#copy-summary',
    ).addEventListener('click', () => void this.copySummary());

    requiredElement<HTMLButtonElement>(
      this.root,
      '#close-sample',
    ).addEventListener('click', () => this.dialog.close());
    requiredElement<HTMLButtonElement>(
      this.root,
      '#cancel-sample',
    ).addEventListener('click', () => this.dialog.close());
    this.sampleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitSample();
    });
  }

  private async refreshApiStatus(): Promise<void> {
    try {
      const health = await checkApiHealth();
      this.apiStatus.classList.remove('is-loading', 'is-offline');
      this.apiStatus.classList.add('is-online');
      this.apiStatus.textContent = health.db
        ? `API connectée · ${health.db.split(' ').slice(0, 2).join(' ')}`
        : 'API connectée';
    } catch {
      this.setApiUnavailable();
    }
  }

  private async submitPrompt(
    prompt: string,
    displayedText = prompt,
    skipQualification?: Qualification,
  ): Promise<void> {
    const previousQuestion =
      this.pendingRefinementQuestion ||
      this.currentResult?.qualification.followup_question?.trim();
    const clarificationAnswer =
      !skipQualification &&
      displayedText === prompt &&
      Boolean(previousQuestion);
    const submittedText = prompt.trim();
    const query =
      clarificationAnswer && this.currentPrompt
        ? `${this.currentPrompt}\nQuestion de suivi posée : ${previousQuestion}\nRéponse de l’utilisateur : ${submittedText}`
        : submittedText;
    if (!query || this.busy) return;

    if (this.input.value.trim() === submittedText) {
      this.input.value = '';
      this.input.style.height = 'auto';
    }
    this.pendingRefinementQuestion = '';
    this.currentPrompt = query;
    this.currentResult = null;
    this.addMessage('user', displayedText);
    this.setBusy(true);
    this.refinements.hidden = true;
    this.matches.replaceChildren(this.createLoadingCard());

    try {
      this.currentResult = await searchCatalog(
        query,
        skipQualification
          ? { action: 'skip', qualification: skipQualification }
          : undefined,
      );
      const hasCandidates = this.renderMatches(this.currentResult);
      this.renderProgress(this.currentResult.qualification, hasCandidates);
      const followup = this.currentResult.qualification.followup_question;
      const matchSummaries = [
        this.currentResult.bestMatch
          ? `Meilleur choix — ${this.currentResult.bestMatch.name} · Réf. ${this.currentResult.bestMatch.ref_code}\n${this.currentResult.bestMatch.sensory_notes}`
          : '',
        this.currentResult.alternative
          ? `Alternative — ${this.currentResult.alternative.name} · Réf. ${this.currentResult.alternative.ref_code}\n${this.currentResult.alternative.sensory_notes}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      this.addMessage(
        'assistant',
        followup && !hasCandidates
          ? `Pour affiner la recherche, ${followup.charAt(0).toLowerCase()}${followup.slice(1)}`
          : followup ||
              (hasCandidates
                ? `J’ai trouvé ${this.currentResult.alternative ? 'deux pistes' : 'une piste'} à explorer. Vous pouvez les comparer ou demander un échantillon.\n\n${matchSummaries}`
                : 'Je n’ai pas encore de correspondance exploitable. Essayez de préciser votre profil sensoriel.'),
      );
      this.renderRefinements(this.currentResult.qualification);
      this.setApiConnected();
      this.expertSummary.hidden = true;
    } catch (error) {
      const message = errorMessage(error);
      this.addMessage(
        'assistant',
        `Je ne peux pas lancer la recherche pour le moment. ${message}`,
      );
      this.matches.replaceChildren(this.createNotice(message, 'error'));
      this.setApiUnavailable();
    } finally {
      this.setBusy(false);
    }
  }

  private addMessage(role: 'assistant' | 'user', text: string): void {
    const article = document.createElement('article');
    article.className = `message message-${role}`;
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'assistant' ? 'G' : 'VOUS';

    const content = document.createElement('div');
    content.className = 'message-content';
    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent =
      role === 'assistant' ? 'Votre conseiller SmartOrder' : 'Vous';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    bubble.append(paragraph);
    const time = document.createElement('time');
    time.className = 'message-time';
    time.textContent = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
    content.append(author, bubble, time);
    article.append(avatar, content);
    this.conversation.append(article);
    article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendButton.disabled = busy;
    this.sendButton.setAttribute('aria-busy', String(busy));
    this.sendButton.querySelector('span')!.textContent = busy
      ? 'Recherche…'
      : 'Rechercher';
    this.input.setAttribute('aria-busy', String(busy));
  }

  private setListening(listening: boolean): void {
    this.microphoneButton.classList.toggle('is-listening', listening);
    this.microphoneButton.setAttribute('aria-pressed', String(listening));
    this.microphoneButton.setAttribute(
      'aria-label',
      listening ? 'Arrêter la dictée vocale' : 'Démarrer la dictée vocale',
    );
    if (!listening && this.voiceStatus.classList.contains('is-error')) return;
    this.voiceStatus.classList.remove('is-error');
    this.voiceStatus.textContent = listening
      ? 'Je vous écoute… cliquez à nouveau pour arrêter.'
      : 'Recherche en français ou dictez votre idée';
  }

  private setApiConnected(): void {
    this.apiStatus.classList.remove('is-loading', 'is-offline');
    this.apiStatus.classList.add('is-online');
    this.apiStatus.textContent = 'API connectée';
  }

  private setApiUnavailable(): void {
    this.apiStatus.classList.remove('is-loading', 'is-online');
    this.apiStatus.classList.add('is-offline');
    this.apiStatus.textContent = 'API indisponible';
  }

  private renderProgress(
    qualification: Qualification,
    hasCandidates: boolean,
  ): void {
    const details =
      Number(Boolean(qualification.application)) * 24 +
      Math.min(qualification.profile_tags.length, 4) * 12;
    const value = qualification.is_complete
      ? hasCandidates
        ? 100
        : 75
      : Math.min(88, 24 + details);
    this.progress.value = value;
    this.progressLabel.textContent = `${value}%`;
    this.progressCaption.textContent = qualification.is_complete
      ? hasCandidates
        ? 'Brief complet · sélection affinée.'
        : 'Brief complet · aucune correspondance exacte dans le catalogue.'
      : 'Ajoutez quelques détails pour affiner la sélection.';
  }

  private renderMatches(result: CatalogSearchResponse): boolean {
    this.matches.replaceChildren();
    if (!result.bestMatch) {
      this.matches.append(
        this.createNotice(
          'Aucune piste pour le moment. Répondez à la question ci-dessus pour affiner la recherche.',
          'empty',
        ),
      );
      return false;
    }

    this.matches.append(
      this.createMatchCard(result.bestMatch, 'Meilleur choix', true),
    );
    if (result.alternative) {
      this.matches.append(
        this.createMatchCard(result.alternative, 'Alternative', false),
      );
    }
    return true;
  }

  private createMatchCard(
    match: CatalogMatch,
    label: string,
    isBest: boolean,
  ): HTMLElement {
    const card = document.createElement('article');
    card.className = `match-card${isBest ? ' match-card-best' : ''}`;

    const header = document.createElement('div');
    header.className = 'match-card-header';
    const badge = document.createElement('span');
    badge.className = `match-badge${isBest ? ' match-badge-best' : ''}`;
    badge.textContent = label;
    header.append(badge);
    if (match.similarity !== null && Number.isFinite(match.similarity)) {
      const percent = Math.max(
        0,
        Math.min(100, Math.round(match.similarity * 100)),
      );
      const score = document.createElement('span');
      score.className = 'match-score';
      score.textContent = `${percent}% match`;
      header.append(score);
    }

    const title = document.createElement('h3');
    title.textContent = match.name;
    const reference = document.createElement('p');
    reference.className = 'match-reference';
    reference.textContent = `${match.ref_code} · ${match.category}`;
    const details = document.createElement('p');
    details.className = 'match-notes';
    details.textContent = match.sensory_notes;
    const metadata = document.createElement('div');
    metadata.className = 'match-metadata';
    const application = document.createElement('span');
    application.textContent = match.application_type;
    metadata.append(application);
    if (match.is_natural) {
      const natural = document.createElement('span');
      natural.className = 'natural-badge';
      natural.textContent = 'Naturel';
      metadata.append(natural);
    }

    const requestButton = document.createElement('button');
    requestButton.className = isBest
      ? 'sample-button'
      : 'sample-button sample-button-quiet';
    requestButton.type = 'button';
    requestButton.textContent = 'Demander un échantillon';
    requestButton.addEventListener('click', () => this.openSampleDialog(match));

    card.append(header, title, reference, details, metadata, requestButton);
    if (isBest) {
      const feedback = document.createElement('div');
      feedback.className = 'match-feedback';
      const acceptButton = document.createElement('button');
      acceptButton.type = 'button';
      acceptButton.textContent = 'Ce résultat me convient';
      acceptButton.addEventListener('click', () => {
        this.refinements.hidden = true;
        this.addMessage(
          'assistant',
          'Parfait, cette piste vous convient. Vous pouvez demander un échantillon ou continuer à affiner.',
        );
      });

      const refineButton = document.createElement('button');
      refineButton.type = 'button';
      refineButton.textContent = 'Affiner ce résultat';
      refineButton.addEventListener('click', () => {
        this.pendingRefinementQuestion =
          'Qu’aimeriez-vous ajuster dans cette piste : la note, la douceur, l’intensité ou un autre aspect ?';
        this.refinements.hidden = true;
        this.addMessage('assistant', this.pendingRefinementQuestion);
        this.input.focus();
      });
      feedback.append(acceptButton, refineButton);
      card.append(feedback);
    }
    return card;
  }

  private renderRefinements(qualification: Qualification): void {
    const question = qualification.followup_question?.trim();
    if (!question) {
      this.refinements.hidden = true;
      return;
    }
    const beverageFormatQuestion =
      qualification.category === 'Flavor' &&
      /prête à boire|poudre à diluer/i.test(question);
    this.refinements
      .querySelectorAll<HTMLButtonElement>(
        '[data-application]:not(.refinement-skip)',
      )
      .forEach((button) => {
        button.hidden = !beverageFormatQuestion;
      });
    const skipButton =
      this.refinements.querySelector<HTMLButtonElement>('.refinement-skip');
    if (skipButton) skipButton.hidden = beverageFormatQuestion;
    this.refinementQuestion.textContent = question;
    this.refinements.hidden = false;
  }

  private createLoadingCard(): HTMLElement {
    const loading = document.createElement('div');
    loading.className = 'loading-card';
    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = 'Analyse du profil sensoriel…';
    loading.append(spinner, text);
    return loading;
  }

  private createNotice(text: string, type: 'empty' | 'error'): HTMLElement {
    const notice = document.createElement('div');
    notice.className = `result-notice result-notice-${type}`;
    notice.textContent = text;
    return notice;
  }

  private openSampleDialog(match: CatalogMatch): void {
    this.selectedMatch = match;
    this.sampleReference.textContent = `${match.name} · Réf. ${match.ref_code}`;
    this.sampleError.textContent = '';
    this.sampleForm.reset();
    requiredElement<HTMLInputElement>(
      this.sampleForm,
      '[name="quantity"]',
    ).value = '1';
    this.dialog.showModal();
  }

  private async submitSample(): Promise<void> {
    if (!this.selectedMatch) return;
    const formData = new FormData(this.sampleForm);
    const clientName = String(formData.get('client_name') ?? '').trim();
    const shippingAddress = String(
      formData.get('shipping_address') ?? '',
    ).trim();
    const quantity = Number(formData.get('quantity'));
    const submitButton = requiredElement<HTMLButtonElement>(
      this.sampleForm,
      '[type="submit"]',
    );
    submitButton.disabled = true;
    this.sampleError.textContent = '';

    let created: SampleRequest;
    try {
      created = await createSample({
        reference_id: this.selectedMatch.id,
        client_name: clientName || null,
        shipping_address: shippingAddress,
        quantity,
      });
    } catch (error) {
      this.sampleError.textContent = errorMessage(error);
      submitButton.disabled = false;
      return;
    }

    this.currentSample = created;
    this.dialog.close();
    this.addMessage(
      'assistant',
      `Votre demande d’échantillon #${created.id} pour ${this.selectedMatch.name} a bien été enregistrée.`,
    );
    await this.refreshTracking(created.id);
    submitButton.disabled = false;
    this.expertSummary.hidden = true;
  }

  private async refreshTracking(id: number): Promise<void> {
    this.tracking.hidden = false;
    this.tracking.replaceChildren(
      this.createNotice('Chargement du suivi…', 'empty'),
    );
    try {
      this.currentSample = await getSample(id);
      this.renderTracking(this.currentSample);
    } catch (error) {
      this.tracking.replaceChildren(
        this.createNotice(
          `Impossible de charger le suivi : ${errorMessage(error)}`,
          'error',
        ),
      );
    }
  }

  private renderTracking(sample: SampleRequest): void {
    const card = document.createElement('article');
    card.className = 'tracking-card';
    const heading = document.createElement('div');
    heading.className = 'tracking-heading';
    const title = document.createElement('h2');
    title.textContent = `Suivi de l’échantillon #${sample.id}`;
    const status = document.createElement('span');
    status.className = 'tracking-status';
    status.textContent = sample.status ?? 'Statut indisponible';
    heading.append(title, status);

    const details = document.createElement('p');
    details.className = 'tracking-details';
    details.textContent = `${sample.quantity ?? 1} unité(s) · ${sample.shipping_address}`;

    const steps = document.createElement('ol');
    steps.className = 'tracking-steps';
    const activeStep = sample.status
      ? sampleStatuses.indexOf(sample.status)
      : -1;
    sampleStatuses.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = [
        index <= activeStep ? 'is-complete' : '',
        index === activeStep ? 'is-current' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const marker = document.createElement('span');
      marker.className = 'step-marker';
      marker.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = step;
      item.append(marker, label);
      if (index === activeStep) item.setAttribute('aria-current', 'step');
      steps.append(item);
    });

    const refresh = document.createElement('button');
    refresh.className = 'tracking-refresh';
    refresh.type = 'button';
    refresh.textContent = 'Actualiser le suivi';
    refresh.addEventListener(
      'click',
      () => void this.refreshTracking(sample.id),
    );
    card.append(heading, details, steps, refresh);
    this.tracking.replaceChildren(card);
  }

  private async copySummary(): Promise<void> {
    this.expertText.value = this.buildSummary();
    this.expertSummary.hidden = false;
    try {
      await navigator.clipboard.writeText(this.expertText.value);
      this.expertStatus.textContent =
        'Récapitulatif copié. Vous pouvez le partager avec l’équipe ADV.';
    } catch {
      this.expertText.focus();
      this.expertText.select();
      this.expertStatus.textContent =
        'Fiche prête : copiez le texte sélectionné et partagez-le avec l’équipe ADV.';
    }
  }

  private buildSummary(): string {
    const qualification = this.currentResult?.qualification;
    const lines = [
      'GIVAUDAN SMARTORDER — BRIEF CLIENT',
      `Demande : ${this.currentPrompt || 'À compléter'}`,
      `Application : ${qualification?.application || 'À préciser'}`,
      `Profil sensoriel : ${qualification?.profile_tags.join(', ') || 'À préciser'}`,
      `Brief complet : ${qualification?.is_complete ? 'Oui' : 'Non'}`,
      `Question à préciser : ${qualification?.followup_question || 'Aucune'}`,
      '',
      `Meilleur choix : ${this.currentResult?.bestMatch?.name ?? 'Aucun résultat'}`,
      `Référence : ${this.currentResult?.bestMatch?.ref_code ?? '—'}`,
      `Alternative : ${this.currentResult?.alternative?.name ?? 'Aucune'}`,
    ];
    if (this.currentSample) {
      lines.push(
        '',
        `Échantillon : #${this.currentSample.id}`,
        `Statut : ${this.currentSample.status ?? 'Indisponible'}`,
        `Quantité : ${this.currentSample.quantity ?? 'Indisponible'}`,
        `Livraison : ${this.currentSample.shipping_address}`,
      );
    }
    return lines.join('\n');
  }
}

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Élément UI introuvable : ${selector}`);
  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Une erreur inconnue est survenue.';
}
