import {
  submitBriefAndMatch,
  type BriefMatchResponse,
  type LiveBrief,
  type Recommendation,
} from '../services/api';
import { SpeechInput } from '../services/speech';

const sampleStatuses = ['Demandé', 'Préparé', 'Expédié', 'Reçu'] as const;
const sampleWorkflowStorageKey = 'smartorder.sample-workflow.v1';

type SampleStatus = (typeof sampleStatuses)[number];

interface SampleDraft {
  id: string;
  referenceCode: string;
  referenceName: string;
  quantity: number;
  format: string;
  shippingAddress: string;
  internalReference: string;
}

interface SampleTracking extends SampleDraft {
  status: SampleStatus;
  requestedAt: string;
}

interface SampleWorkflow {
  draft: SampleDraft | null;
  tracking: SampleTracking[];
}

const emptySampleWorkflow = (): SampleWorkflow => ({
  draft: null,
  tracking: [],
});

const emptyBrief = (): LiveBrief => ({
  application: null,
  profil_olfactif: null,
  volume: null,
  prix_cible: null,
  allergenes: null,
  contraintes: null,
});

const briefLabels: Record<keyof LiveBrief, string> = {
  application: 'Application',
  profil_olfactif: 'Profil olfactif',
  volume: 'Volume',
  prix_cible: 'Prix cible',
  allergenes: 'Allergènes',
  contraintes: 'Contraintes',
};

export class PrototypeInterface {
  private readonly conversation: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly microphoneButton: HTMLButtonElement;
  private readonly voiceStatus: HTMLElement;
  private readonly briefFields: HTMLElement;
  private readonly recommendations: HTMLElement;
  private readonly resultsPanel: HTMLElement;
  private readonly orderForm: HTMLFormElement;
  private readonly orderEmpty: HTMLElement;
  private readonly orderFeedback: HTMLElement;
  private readonly trackingRequests: HTMLElement;
  private readonly speech: SpeechInput;
  private brief = emptyBrief();
  private scenarioId: string | null = null;
  private sampleWorkflow = emptySampleWorkflow();
  private voicePrefix = '';
  private busy = false;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="prototype-shell">
        <aside class="prototype-sidebar" aria-label="Navigation principale">
          <a class="prototype-brand" href="/" aria-label="Givaudan, accueil">
            <span>Givaudan</span>
            <small>Assistant de commande · Arômes</small>
          </a>
          <button class="new-request" type="button" data-action="new">＋&nbsp; Nouvelle demande</button>
          <nav class="prototype-nav">
            <a class="is-active" href="#assistant" data-view="assistant"><span aria-hidden="true">◯</span> Assistant</a>
            <a href="#demandes" data-view="order"><span aria-hidden="true">☷</span> Mes demandes</a>
            <a href="#suivi" data-view="tracking"><span aria-hidden="true">▣</span> Suivi</a>
            <a href="#catalogue"><span aria-hidden="true">□</span> Catalogue</a>
          </nav>
          <div class="recent-requests">
            <span class="sidebar-label">Récemment</span>
            <button type="button" data-prompt="Je cherche un arôme fruits rouges pour une boisson protéinée en poudre">Arôme fruits rouges · boisson protéinée</button>
            <button type="button" data-prompt="Nous développons une gamme de savons premium aux agrumes et au thé blanc">Savon premium · agrumes & thé blanc</button>
            <button type="button" data-prompt="Je cherche un parfum floral boisé proche d’un ancien lancement">Fragrance florale · ancien lancement</button>
          </div>
          <div class="prototype-user">
            <span class="user-avatar">J</span>
            <span><strong>Julien</strong><small>PME Boissons · Acheteur</small></span>
          </div>
        </aside>

        <main class="prototype-main" id="assistant">
          <header class="prototype-topbar">
            <span class="assistant-pill"><span aria-hidden="true">◉</span> Assistant de commande</span>
            <span class="confirmation-pill"><span aria-hidden="true">✓</span> Prix et délais toujours confirmés par Givaudan</span>
          </header>

          <div class="prototype-content assistant-view" data-page="assistant">
            <section class="welcome" id="welcome">
              <span class="welcome-orb" aria-hidden="true"></span>
              <span class="welcome-eyebrow">Bonjour Julien</span>
              <h1>De quel arôme avez-vous besoin&nbsp;?</h1>
              <p>Décrivez votre produit avec vos mots. Je trouve les références du catalogue qui correspondent.</p>
            </section>

            <div class="active-workspace">
              <section class="chat-column" aria-label="Conversation avec l’assistant">
                <div class="prototype-conversation" id="prototype-conversation" aria-live="polite">
                  <article class="conversation-message assistant-message">
                    <p>Bonjour Julien ! Décrivez votre produit et je vous proposerai les références adaptées.</p>
                  </article>
                </div>
                <form class="prototype-composer" id="prototype-form">
                  <label class="sr-only" for="prototype-input">Décrivez votre besoin</label>
                  <textarea id="prototype-input" rows="1" placeholder="Ex. : un arôme fruits rouges, naturel, pour une boisson protéinée en poudre…" required></textarea>
                  <div class="composer-options">
                    <div class="format-chips" aria-label="Précisions rapides">
                      <button type="button" data-append=" pour une poudre à diluer">Poudre</button>
                      <button type="button" data-append=" pour une boisson prête à boire">Prête à boire</button>
                      <button type="button" data-append=" avec des ingrédients naturels">Naturel</button>
                    </div>
                    <div class="composer-submit">
                      <button class="voice-button" id="prototype-microphone" type="button" aria-label="Démarrer la dictée vocale" title="Dicter votre demande">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3"></path></svg>
                        <span>Maintenir pour parler</span>
                      </button>
                      <button class="prototype-send" id="prototype-send" type="submit" aria-label="Envoyer la demande">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg>
                      </button>
                    </div>
                  </div>
                  <span class="prototype-voice-status" id="prototype-voice-status" role="status"></span>
                </form>
                <p class="prototype-note">L’assistant propose des références du catalogue et cite sa source. Il n’invente ni prix, ni délai, ni compatibilité.</p>
                <div class="scenario-prompts" aria-label="Exemples de demandes">
                  <button type="button" data-prompt="Trouver un arôme pour un nouveau produit">Trouver un arôme pour un nouveau produit</button>
                  <button type="button" data-prompt="Recommander un parfum proche d’un ancien lancement">Recommander ma dernière commande</button>
                  <button type="button" data-prompt="Suivre mes échantillons">Suivre mes échantillons</button>
                </div>
              </section>

              <aside class="results-column" id="results-panel" aria-label="Brief et recommandations" hidden>
                <section class="brief-card">
                  <div class="result-card-heading">
                    <div><span class="panel-eyebrow">Votre besoin</span><h2>Brief en direct</h2></div>
                    <span class="live-indicator">EN DIRECT</span>
                  </div>
                  <dl class="brief-fields" id="brief-fields"></dl>
                </section>
                <section class="recommendations-card">
                  <div class="result-card-heading">
                    <div><span class="panel-eyebrow">Sélection du catalogue</span><h2>Nos recommandations</h2></div>
                    <span class="recommendation-count">3 références</span>
                  </div>
                  <div class="recommendation-list" id="recommendations"></div>
                </section>
              </aside>
            </div>

            <footer class="prototype-footer">Prototype · données fictives</footer>
          </div>

          <section class="order-view" data-page="order" hidden>
            <header class="order-heading">
              <div><span class="page-eyebrow">Demande d’échantillon</span><h1>Demander <span id="order-product-name">un échantillon</span></h1></div>
              <span class="order-status">Brouillon</span>
            </header>
            <p class="request-empty" id="order-empty">Choisissez « Demander un échantillon » dans les recommandations pour commencer une demande.</p>
            <form id="order-form" hidden>
              <div class="order-layout">
                <section class="order-details-card" aria-labelledby="order-details-title">
                  <h2 id="order-details-title">Détails de la demande</h2>
                  <div class="order-detail-row">
                    <span class="order-field-label">Référence</span>
                    <strong id="order-reference">—</strong>
                  </div>
                  <label class="order-input-row">
                    <span class="order-field-label">Quantité d’échantillons</span>
                    <input name="quantity" type="number" min="1" step="1" value="1" required>
                  </label>
                  <label class="order-input-row">
                    <span class="order-field-label">Conditionnement souhaité</span>
                    <input name="format" placeholder="À préciser ou à confirmer">
                  </label>
                  <label class="order-input-row">
                    <span class="order-field-label">Adresse de livraison</span>
                    <textarea name="shippingAddress" rows="3" autocomplete="street-address" placeholder="Adresse complète" required></textarea>
                  </label>
                  <label class="order-input-row">
                    <span class="order-field-label">Référence interne (facultatif)</span>
                    <input name="internalReference" placeholder="Ex. : lancement printemps">
                  </label>
                </section>
                <aside class="order-summary">
                  <div>
                    <span class="page-eyebrow">Récapitulatif</span>
                    <h2 id="order-summary-name">un échantillon</h2>
                    <p class="summary-quantity"><span data-summary-quantity>1</span> échantillon(s) · <span data-summary-format>À confirmer</span></p>
                    <div class="price-confirmation">
                      <strong>Demande enregistrée localement</strong>
                      <p>La demande sera visible dans le suivi après son envoi.</p>
                    </div>
                  </div>
                  <div class="summary-actions">
                    <button class="place-order-button" type="submit">➜&nbsp; Envoyer la commande</button>
                    <p class="order-feedback" id="order-feedback" role="status"></p>
                  </div>
                </aside>
              </div>
            </form>
          </section>

          <section class="tracking-view" data-page="tracking" hidden>
            <header class="tracking-page-heading">
              <span class="page-eyebrow">Suivi</span>
              <h1>Où en sont vos demandes&nbsp;?</h1>
              <div class="tracking-filters" role="group" aria-label="Filtrer les demandes">
                <button class="is-selected" type="button" data-filter="all">Tout</button>
                <button type="button" data-filter="samples">Échantillons</button>
              </div>
            </header>
            <div class="tracking-list" id="tracking-requests" aria-live="polite"></div>
          </section>
        </main>
      </div>
    `;

    this.conversation = requiredElement(root, '#prototype-conversation');
    this.form = requiredElement(root, '#prototype-form');
    this.input = requiredElement(root, '#prototype-input');
    this.sendButton = requiredElement(root, '#prototype-send');
    this.microphoneButton = requiredElement(root, '#prototype-microphone');
    this.voiceStatus = requiredElement(root, '#prototype-voice-status');
    this.resultsPanel = requiredElement(root, '#results-panel');
    this.briefFields = requiredElement(root, '#brief-fields');
    this.recommendations = requiredElement(root, '#recommendations');
    this.orderForm = requiredElement(root, '#order-form');
    this.orderEmpty = requiredElement(root, '#order-empty');
    this.orderFeedback = requiredElement(root, '#order-feedback');
    this.trackingRequests = requiredElement(root, '#tracking-requests');
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
    this.renderBrief(this.brief);
    this.restoreSampleWorkflow();
    this.bindEvents();
  }

  private bindEvents(): void {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.sendMessage(this.input.value);
    });

    this.orderForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitSampleRequest();
    });
    this.orderForm.addEventListener('input', () => {
      this.updateSampleDraft();
    });

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });

    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(this.input.scrollHeight, 100)}px`;
    });

    this.microphoneButton.addEventListener('click', () => {
      if (this.speech.isListening) {
        this.speech.stop();
      } else {
        this.voicePrefix = this.input.value.trim();
        this.voiceStatus.classList.remove('is-error');
        this.speech.start();
      }
    });

    this.root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const newRequest = target.closest<HTMLButtonElement>(
        '[data-action="new"]',
      );
      if (newRequest) {
        this.reset();
        return;
      }

      const viewLink = target.closest<HTMLAnchorElement>('[data-view]');
      if (viewLink?.dataset.view) {
        event.preventDefault();
        this.showPage(viewLink.dataset.view);
        return;
      }

      const viewButton = target.closest<HTMLButtonElement>('[data-view]');
      if (viewButton?.dataset.view) {
        this.showPage(viewButton.dataset.view);
        return;
      }

      const filterButton = target.closest<HTMLButtonElement>('[data-filter]');
      if (filterButton?.dataset.filter) {
        this.filterRequests(filterButton.dataset.filter);
        return;
      }

      const promptButton = target.closest<HTMLButtonElement>('[data-prompt]');
      if (promptButton?.dataset.prompt) {
        void this.sendMessage(promptButton.dataset.prompt);
        return;
      }

      const appendButton = target.closest<HTMLButtonElement>('[data-append]');
      if (appendButton?.dataset.append) {
        this.input.value =
          `${this.input.value.trim()}${appendButton.dataset.append}`.trim();
        this.input.focus();
        return;
      }

      const sampleButton = target.closest<HTMLButtonElement>('[data-sample]');
      if (sampleButton?.dataset.sample) {
        const referenceName = sampleButton.dataset.sampleName;
        if (referenceName) {
          this.createSampleDraft(sampleButton.dataset.sample, referenceName);
        }
        return;
      }

      const detailsButton = target.closest<HTMLButtonElement>('[data-details]');
      if (detailsButton?.dataset.details) {
        const recommendation = this.recommendations.querySelector(
          `.recommendation[data-reference="${CSS.escape(detailsButton.dataset.details)}"]`,
        );
        if (recommendation) {
          this.appendMessage(
            'assistant',
            recommendation.textContent ??
              'Détails de la référence indisponibles.',
          );
        }
      }
    });
  }

  private async sendMessage(text: string): Promise<void> {
    const message = text.trim();
    if (!message || this.busy) return;
    this.input.value = '';
    this.input.style.height = 'auto';
    this.appendMessage('user', message);
    this.setBusy(true);

    try {
      const response = await submitBriefAndMatch(
        message,
        this.brief,
        this.scenarioId,
      );
      this.updateFromResponse(response);
      this.appendAssistantResponse(response);
    } catch (error) {
      this.appendMessage(
        'assistant',
        `Je n’ai pas pu traiter votre demande. ${errorMessage(error)}`,
      );
    } finally {
      this.setBusy(false);
    }
  }

  private updateFromResponse(response: BriefMatchResponse): void {
    this.brief = response.brief;
    this.scenarioId = response.scenarioId;
    this.renderBrief(response.brief);
    this.renderRecommendations(response.recommendations);
    this.resultsPanel.hidden = false;
    this.root.querySelector('.prototype-main')?.classList.add('has-results');
    this.root.querySelector('.active-workspace')?.classList.add('has-results');
    this.root.querySelector('.welcome')?.classList.add('has-results');
  }

  private renderBrief(brief: LiveBrief): void {
    this.briefFields.replaceChildren();
    (Object.keys(briefLabels) as Array<keyof LiveBrief>).forEach((field) => {
      const row = document.createElement('div');
      row.className = 'brief-row';
      const label = document.createElement('dt');
      label.textContent = briefLabels[field];
      const value = document.createElement('dd');
      value.textContent = brief[field] ?? '—';
      if (!brief[field]) value.className = 'is-empty';
      row.append(label, value);
      this.briefFields.append(row);
    });
  }

  private renderRecommendations(items: Recommendation[]): void {
    this.recommendations.replaceChildren();
    const count = this.resultsPanel.querySelector('.recommendation-count');
    if (count) {
      count.textContent =
        items.length === 1 ? '1 référence' : `${items.length} références`;
    }

    if (items.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'recommendation-empty';
      emptyState.textContent =
        'Aucune référence proche trouvée. Vous pouvez préciser votre application ou votre profil.';
      this.recommendations.append(emptyState);
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'recommendation';
      card.dataset.reference = item.id;
      const top = document.createElement('div');
      top.className = 'recommendation-top';
      const rank = document.createElement('span');
      rank.textContent = `0${index + 1}`;
      const reference = document.createElement('span');
      reference.textContent = `Réf. ${item.id}`;
      top.append(rank, reference);

      const title = document.createElement('h3');
      title.textContent = item.name;
      const justification = document.createElement('p');
      justification.textContent = item.justification;

      const details = document.createElement('div');
      details.className = 'recommendation-details';
      details.append(
        detail(
          'Prix indicatif',
          item.price ? `${item.price} €/kg` : 'À confirmer',
        ),
        detail(
          'Volume minimum',
          item.minimumVolume ? `${item.minimumVolume} kg` : 'À confirmer',
        ),
      );

      const actions = document.createElement('div');
      actions.className = 'recommendation-actions';
      const detailButton = document.createElement('button');
      detailButton.type = 'button';
      detailButton.dataset.details = item.id;
      detailButton.textContent = 'Voir la fiche';
      const sampleButton = document.createElement('button');
      sampleButton.type = 'button';
      sampleButton.dataset.sample = item.id;
      sampleButton.dataset.sampleName = item.name;
      sampleButton.textContent = 'Demander un échantillon';
      actions.append(detailButton, sampleButton);
      card.append(top, title, justification, details, actions);
      this.recommendations.append(card);
    });
  }

  private appendAssistantResponse(response: BriefMatchResponse): void {
    const message = document.createElement('article');
    message.className = 'conversation-message assistant-message';
    const paragraph = document.createElement('p');
    paragraph.textContent = response.assistantMessage;
    message.append(paragraph);

    if (response.recommendations.length > 0) {
      message.classList.add('has-recommendations');
      const list = document.createElement('div');
      list.className = 'chat-recommendations';
      list.setAttribute('aria-label', 'Propositions de références');

      response.recommendations.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'chat-recommendation';
        const heading = document.createElement('div');
        heading.className = 'chat-recommendation-heading';
        const title = document.createElement('strong');
        title.textContent = item.name;
        const reference = document.createElement('span');
        reference.textContent = `Réf. ${item.id}`;
        heading.append(title, reference);

        const justification = document.createElement('p');
        justification.className = 'sr-only';
        justification.textContent = item.justification;

        const footer = document.createElement('div');
        footer.className = 'chat-recommendation-footer';
        const price = document.createElement('span');
        price.textContent = item.price
          ? `${item.price} €/kg`
          : 'Prix à confirmer';
        const detailButton = document.createElement('button');
        detailButton.type = 'button';
        detailButton.dataset.details = item.id;
        detailButton.textContent = 'Voir la fiche';
        footer.append(price, detailButton);
        card.append(heading, justification, footer);
        list.append(card);
      });

      message.append(list);
    }

    this.conversation.append(message);
    this.scrollConversationToEnd();
  }

  private appendMessage(role: 'assistant' | 'user', text: string): void {
    const message = document.createElement('article');
    message.className = `conversation-message ${role}-message`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    message.append(paragraph);
    this.conversation.append(message);
    this.scrollConversationToEnd();
  }

  private scrollConversationToEnd(): void {
    requestAnimationFrame(() => {
      if (this.conversation.scrollHeight > this.conversation.clientHeight) {
        this.conversation.scrollTo({
          top: this.conversation.scrollHeight,
          behavior: 'smooth',
        });
      }
    });
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendButton.disabled = busy;
    this.sendButton.setAttribute('aria-busy', String(busy));
    this.sendButton.innerHTML = busy
      ? '<span class="prototype-spinner" aria-label="Traitement en cours"></span>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg>';
    this.input.disabled = busy;
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
    this.voiceStatus.textContent = listening ? 'Je vous écoute…' : '';
  }

  private reset(): void {
    if (this.busy) return;
    this.brief = emptyBrief();
    this.scenarioId = null;
    this.conversation.replaceChildren();
    this.conversation.innerHTML =
      '<article class="conversation-message assistant-message"><p>Bonjour Julien ! Décrivez votre produit et je vous proposerai les références adaptées.</p></article>';
    this.renderBrief(this.brief);
    this.recommendations.replaceChildren();
    this.resultsPanel.hidden = true;
    this.root.querySelector('.prototype-main')?.classList.remove('has-results');
    this.root
      .querySelector('.active-workspace')
      ?.classList.remove('has-results');
    this.root.querySelector('.welcome')?.classList.remove('has-results');
    this.input.value = '';
    this.showPage('assistant');
  }

  private showPage(page: string): void {
    if (page !== 'assistant' && page !== 'order' && page !== 'tracking') return;
    this.root
      .querySelectorAll<HTMLElement>('[data-page]')
      .forEach((section) => {
        section.hidden = section.dataset.page !== page;
      });
    this.root
      .querySelector('.prototype-main')
      ?.classList.toggle('is-secondary-page', page !== 'assistant');
    this.root
      .querySelectorAll<HTMLAnchorElement>('.prototype-nav [data-view]')
      .forEach((link) => {
        const isActive =
          page === 'order'
            ? link.getAttribute('href') === '#demandes'
            : link.dataset.view === page;
        link.classList.toggle('is-active', isActive);
      });
    if (page === 'order') this.renderSampleDraft();
    if (page === 'tracking') this.renderSampleTracking();
  }

  private filterRequests(filter: string): void {
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-filter]')
      .forEach((button) => {
        button.classList.toggle(
          'is-selected',
          button.dataset.filter === filter,
        );
      });
    this.root
      .querySelectorAll<HTMLElement>('[data-request-type]')
      .forEach((card) => {
        card.hidden = filter !== 'all' && card.dataset.requestType !== filter;
      });
  }

  private restoreSampleWorkflow(): void {
    try {
      this.sampleWorkflow = readSampleWorkflow();
      this.renderSampleDraft();
      this.renderSampleTracking();
    } catch (error) {
      this.appendMessage(
        'assistant',
        `Impossible de lire les demandes enregistrées localement. ${errorMessage(error)}`,
      );
    }
  }

  private createSampleDraft(
    referenceCode: string,
    referenceName: string,
  ): void {
    const draft: SampleDraft = {
      id: crypto.randomUUID(),
      referenceCode,
      referenceName,
      quantity: 1,
      format: '',
      shippingAddress: '',
      internalReference: '',
    };
    const nextWorkflow = { ...this.sampleWorkflow, draft };
    try {
      writeSampleWorkflow(nextWorkflow);
      this.sampleWorkflow = nextWorkflow;
      this.orderFeedback.textContent = '';
      this.renderSampleDraft();
      this.showPage('order');
    } catch (error) {
      this.appendMessage(
        'assistant',
        `Impossible d’enregistrer le brouillon sur cet appareil. ${errorMessage(error)}`,
      );
    }
  }

  private renderSampleDraft(): void {
    const draft = this.sampleWorkflow.draft;
    this.orderEmpty.hidden = draft !== null;
    this.orderForm.hidden = draft === null;
    if (!draft) return;

    requiredElement<HTMLElement>(this.root, '#order-product-name').textContent =
      draft.referenceName;
    requiredElement<HTMLElement>(this.root, '#order-reference').textContent =
      `${draft.referenceName} · Réf. ${draft.referenceCode}`;
    requiredElement<HTMLElement>(this.root, '#order-summary-name').textContent =
      draft.referenceName;
    requiredElement<HTMLInputElement>(
      this.orderForm,
      '[name="quantity"]',
    ).value = String(draft.quantity);
    requiredElement<HTMLInputElement>(this.orderForm, '[name="format"]').value =
      draft.format;
    requiredElement<HTMLTextAreaElement>(
      this.orderForm,
      '[name="shippingAddress"]',
    ).value = draft.shippingAddress;
    requiredElement<HTMLInputElement>(
      this.orderForm,
      '[name="internalReference"]',
    ).value = draft.internalReference;
    requiredElement<HTMLElement>(
      this.root,
      '[data-summary-quantity]',
    ).textContent = String(draft.quantity);
    requiredElement<HTMLElement>(
      this.root,
      '[data-summary-format]',
    ).textContent = draft.format || 'À confirmer';
  }

  private updateSampleDraft(): void {
    const draft = this.sampleWorkflow.draft;
    if (!draft) return;
    const formData = new FormData(this.orderForm);
    const quantity = Number(formData.get('quantity'));
    const nextDraft: SampleDraft = {
      ...draft,
      quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
      format: String(formData.get('format') ?? '').trim(),
      shippingAddress: String(formData.get('shippingAddress') ?? '').trim(),
      internalReference: String(formData.get('internalReference') ?? '').trim(),
    };
    const nextWorkflow = { ...this.sampleWorkflow, draft: nextDraft };
    try {
      writeSampleWorkflow(nextWorkflow);
      this.sampleWorkflow = nextWorkflow;
      requiredElement<HTMLElement>(
        this.root,
        '[data-summary-quantity]',
      ).textContent = String(nextDraft.quantity);
      requiredElement<HTMLElement>(
        this.root,
        '[data-summary-format]',
      ).textContent = nextDraft.format || 'À confirmer';
      this.orderFeedback.textContent = '';
    } catch (error) {
      this.orderFeedback.textContent = `Impossible d’enregistrer les détails localement : ${errorMessage(error)}`;
    }
  }

  private submitSampleRequest(): void {
    const draft = this.sampleWorkflow.draft;
    if (!draft) {
      this.orderFeedback.textContent =
        'Aucune demande en brouillon. Revenez à l’assistant pour choisir une référence.';
      return;
    }

    const formData = new FormData(this.orderForm);
    const quantity = Number(formData.get('quantity'));
    const shippingAddress = String(
      formData.get('shippingAddress') ?? '',
    ).trim();
    if (!Number.isInteger(quantity) || quantity < 1 || !shippingAddress) {
      this.orderFeedback.textContent =
        'Indiquez une quantité valide et une adresse de livraison.';
      return;
    }

    const request: SampleTracking = {
      ...draft,
      quantity,
      format: String(formData.get('format') ?? '').trim(),
      shippingAddress,
      internalReference: String(formData.get('internalReference') ?? '').trim(),
      status: 'Demandé',
      requestedAt: new Date().toISOString(),
    };
    const nextWorkflow: SampleWorkflow = {
      draft: null,
      tracking: [request, ...this.sampleWorkflow.tracking],
    };
    try {
      writeSampleWorkflow(nextWorkflow);
      this.sampleWorkflow = nextWorkflow;
      this.orderFeedback.textContent = '';
      this.renderSampleTracking();
      this.appendMessage(
        'assistant',
        `Votre demande d’échantillon #${request.id} pour ${request.referenceName} est enregistrée dans le suivi avec le statut « Demandé ».`,
      );
      this.showPage('tracking');
    } catch (error) {
      this.orderFeedback.textContent = `Impossible d’enregistrer la demande localement : ${errorMessage(error)}`;
    }
  }

  private renderSampleTracking(): void {
    this.trackingRequests.replaceChildren();
    if (this.sampleWorkflow.tracking.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'request-empty';
      empty.textContent =
        'Aucune demande envoyée. Une demande apparaîtra ici après validation sur la page Demandes.';
      this.trackingRequests.append(empty);
      return;
    }

    this.sampleWorkflow.tracking.forEach((request) => {
      const card = document.createElement('article');
      card.className = 'request-card sample-request-card';
      card.dataset.requestType = 'samples';

      const heading = document.createElement('div');
      heading.className = 'request-card-heading';
      const title = document.createElement('div');
      const eyebrow = document.createElement('span');
      eyebrow.className = 'request-eyebrow';
      eyebrow.textContent = `Échantillon · ${formatDate(request.requestedAt)}`;
      const name = document.createElement('h2');
      name.textContent = `${request.referenceName} · Réf. ${request.referenceCode}`;
      title.append(eyebrow, name);
      const status = document.createElement('span');
      status.className = 'order-status';
      status.textContent = request.status;
      heading.append(title, status);

      const details = document.createElement('p');
      details.className = 'tracking-details';
      details.textContent = `${request.quantity} échantillon(s) · ${request.shippingAddress}`;

      const timeline = document.createElement('ol');
      timeline.className = 'request-timeline sample-timeline';
      timeline.setAttribute('aria-label', 'Étapes de la demande d’échantillon');
      const activeStep = sampleStatuses.indexOf(request.status);
      sampleStatuses.forEach((step, index) => {
        const item = document.createElement('li');
        if (index <= activeStep) item.classList.add('is-complete');
        if (index === activeStep) item.classList.add('is-current');
        const dot = document.createElement('span');
        dot.className = 'timeline-dot';
        dot.setAttribute('aria-hidden', 'true');
        if (index <= activeStep) dot.textContent = '✓';
        const label = document.createElement('strong');
        label.textContent = step;
        const description = document.createElement('small');
        description.textContent =
          index < activeStep
            ? 'Étape terminée'
            : index === activeStep
              ? 'Demande enregistrée'
              : 'À venir';
        item.append(dot, label, description);
        timeline.append(item);
      });

      card.append(heading, details, timeline);
      this.trackingRequests.append(card);
    });
  }
}

function detail(label: string, value: string): HTMLElement {
  const item = document.createElement('span');
  const key = document.createElement('small');
  key.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  item.append(key, content);
  return item;
}

function readSampleWorkflow(): SampleWorkflow {
  const serialized = window.localStorage.getItem(sampleWorkflowStorageKey);
  if (serialized === null) return emptySampleWorkflow();

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error('Les données sauvegardées ne sont pas un JSON valide.', {
      cause: error,
    });
  }
  if (
    !isRecord(value) ||
    (value.draft !== null && !isSampleDraft(value.draft)) ||
    !Array.isArray(value.tracking) ||
    !value.tracking.every(isSampleTracking)
  ) {
    throw new Error('Le format des demandes sauvegardées est invalide.');
  }
  return { draft: value.draft, tracking: value.tracking };
}

function writeSampleWorkflow(workflow: SampleWorkflow): void {
  window.localStorage.setItem(
    sampleWorkflowStorageKey,
    JSON.stringify(workflow),
  );
}

function isSampleDraft(value: unknown): value is SampleDraft {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.referenceCode === 'string' &&
    typeof value.referenceName === 'string' &&
    typeof value.quantity === 'number' &&
    Number.isInteger(value.quantity) &&
    typeof value.format === 'string' &&
    typeof value.shippingAddress === 'string' &&
    typeof value.internalReference === 'string'
  );
}

function isSampleTracking(value: unknown): value is SampleTracking {
  if (!isRecord(value)) return false;
  const { status, requestedAt, ...draft } = value;
  return (
    isSampleDraft(draft) &&
    isSampleStatus(status) &&
    typeof requestedAt === 'string'
  );
}

function isSampleStatus(value: unknown): value is SampleStatus {
  return sampleStatuses.some((status) => status === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Date indisponible'
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Élément requis introuvable : ${selector}`);
  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Une erreur inconnue est survenue.';
}
