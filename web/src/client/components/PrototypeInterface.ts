import {
  submitBriefAndMatch,
  type BriefMatchResponse,
  type LiveBrief,
  type Recommendation,
} from '../services/api';
import { SpeechInput } from '../services/speech';

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
  private readonly speech: SpeechInput;
  private brief = emptyBrief();
  private scenarioId: string | null = null;
  private requestedField: keyof LiveBrief | null = null;
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

            <section class="sample-tracking" aria-label="Échantillon en cours">
              <div class="tracking-copy">
                <span class="tracking-eyebrow">Échantillon en cours</span>
                <strong>Arôme fruits rouges · Réf. [CODE]</strong>
                <div class="tracking-progress" aria-label="Demandé, préparé, expédié, reçu">
                  <span class="is-complete"></span><span class="is-complete"></span><span class="is-complete"></span><span></span>
                </div>
                <div class="tracking-labels"><span>Demandé</span><span>Préparé</span><span>Expédié</span><span>Reçu</span></div>
              </div>
              <button type="button" class="tracking-button">Voir le suivi</button>
            </section>
            <footer class="prototype-footer">Prototype · données fictives</footer>
          </div>

          <section class="order-view" data-page="order" hidden>
            <div class="page-breadcrumb">
              <button type="button" data-view="tracking" aria-label="Retour aux demandes">←</button>
              <span>Mes demandes / Arôme fruits rouges</span>
            </div>
            <header class="order-heading">
              <div><span class="page-eyebrow">Commande</span><h1>Commander <span>[Nom de la référence 1]</span></h1></div>
              <span class="order-status">Échantillon validé</span>
            </header>
            <div class="order-layout">
              <section class="order-details-card" aria-labelledby="order-details-title">
                <h2 id="order-details-title">Détails</h2>
                <div class="order-detail-row">
                  <span class="order-field-label">Référence</span>
                  <strong>[Nom de la référence 1] · Réf. [CODE]</strong>
                </div>
                <div class="order-detail-row quantity-row">
                  <div><span class="order-field-label">Quantité</span><strong><span id="order-quantity">[X]</span> kg</strong></div>
                  <div class="quantity-control">
                    <button type="button" data-quantity="-1" aria-label="Réduire la quantité">−</button>
                    <span id="quantity-display">[X]</span>
                    <button type="button" data-quantity="1" aria-label="Augmenter la quantité">+</button>
                  </div>
                </div>
                <div class="order-detail-row editable-row">
                  <div><span class="order-field-label">Conditionnement</span><strong data-value="format">[Format proposé par la fiche]</strong></div>
                  <button type="button" data-edit="format">Modifier</button>
                </div>
                <div class="order-detail-row editable-row">
                  <div><span class="order-field-label">Livraison</span><strong data-value="address">[Adresse de l’entreprise]</strong></div>
                  <button type="button" data-edit="address">Modifier</button>
                </div>
                <div class="order-detail-row editable-row">
                  <div><span class="order-field-label">Référence interne (facultatif)</span><strong data-value="internal">Ex. : lancement printemps</strong></div>
                  <button type="button" data-edit="internal">Modifier</button>
                </div>
              </section>
              <aside class="order-summary">
                <div>
                  <span class="page-eyebrow">Récapitulatif</span>
                  <h2>[Nom de la référence 1]</h2>
                  <p class="summary-quantity"><span data-summary-quantity>[X]</span> kg · <span data-summary-format>[format]</span></p>
                  <div class="price-confirmation">
                    <strong>Prix et date de livraison</strong>
                    <p>Confirmés par Givaudan avant validation définitive. Vous êtes notifié dès réception.</p>
                  </div>
                </div>
                <div class="summary-actions">
                  <button class="place-order-button" type="button" data-action="place-order">➜&nbsp; Envoyer la commande</button>
                  <button class="expert-link" type="button" data-action="expert">♙&nbsp; Une question ? Contacter un expert</button>
                  <p class="order-feedback" id="order-feedback" role="status"></p>
                </div>
              </aside>
            </div>
          </section>

          <section class="tracking-view" data-page="tracking" hidden>
            <header class="tracking-page-heading">
              <span class="page-eyebrow">Suivi</span>
              <h1>Où en sont vos demandes&nbsp;?</h1>
              <div class="tracking-filters" role="group" aria-label="Filtrer les demandes">
                <button class="is-selected" type="button" data-filter="all">Tout</button>
                <button type="button" data-filter="samples">Échantillons</button>
                <button type="button" data-filter="orders">Commandes</button>
              </div>
            </header>
            <div class="tracking-list">
              <article class="request-card" data-request-type="orders">
                <div class="request-card-heading">
                  <div><span class="request-eyebrow">Commande · [N°]</span><h2>[Nom de la référence 1] · [X] kg</h2></div>
                  <span class="order-status">Confirmée</span>
                </div>
                <ol class="request-timeline order-timeline">
                  <li class="is-complete"><span class="timeline-dot">✓</span><strong>Envoyée</strong><small>[date] · reçue par Givaudan</small></li>
                  <li class="is-complete"><span class="timeline-dot">✓</span><strong>Confirmée</strong><small>Prix et date confirmés</small></li>
                  <li><span class="timeline-dot"></span><strong>Expédiée</strong><small>Numéro de suivi à venir</small></li>
                  <li><span class="timeline-dot"></span><strong>Livrée</strong><small>Prévue le [date confirmée]</small></li>
                </ol>
                <div class="request-actions">
                  <button class="contact-link" type="button" data-action="expert">♙&nbsp; Contacter mon interlocuteur</button>
                  <button class="gesture-button" type="button" data-action="gesture">＋&nbsp; Recommander en un geste</button>
                  <span class="tracking-action-status" id="tracking-action-status" role="status"></span>
                </div>
              </article>
              <article class="request-card sample-request-card" data-request-type="samples">
                <div class="request-card-heading">
                  <div><span class="request-eyebrow">Échantillon</span><h2>[Nom de la référence 1]</h2></div>
                  <span class="order-status">Reçu</span>
                </div>
                <ol class="request-timeline sample-timeline">
                  <li class="is-complete"><span class="timeline-dot">✓</span><strong>Demandé</strong></li>
                  <li class="is-complete"><span class="timeline-dot">✓</span><strong>Préparé</strong></li>
                  <li class="is-complete"><span class="timeline-dot">✓</span><strong>Expédié</strong></li>
                  <li class="is-complete"><span class="timeline-dot">✓</span><strong>Reçu</strong></li>
                </ol>
                <div class="request-actions">
                  <button class="feedback-button" type="button" data-action="feedback">Donner mon avis</button>
                  <span class="feedback-confirmation" id="feedback-confirmation" role="status"></span>
                </div>
              </article>
            </div>
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
    this.bindEvents();
  }

  private bindEvents(): void {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.sendMessage(this.input.value);
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

      const quantityButton =
        target.closest<HTMLButtonElement>('[data-quantity]');
      if (quantityButton?.dataset.quantity) {
        this.updateQuantity(Number(quantityButton.dataset.quantity));
        return;
      }

      const editButton = target.closest<HTMLButtonElement>('[data-edit]');
      if (editButton?.dataset.edit) {
        this.editOrderField(editButton.dataset.edit);
        return;
      }

      const filterButton = target.closest<HTMLButtonElement>('[data-filter]');
      if (filterButton?.dataset.filter) {
        this.filterRequests(filterButton.dataset.filter);
        return;
      }

      const actionButton = target.closest<HTMLButtonElement>('[data-action]');
      if (actionButton?.dataset.action) {
        this.handlePageAction(actionButton.dataset.action);
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
        this.appendMessage(
          'assistant',
          `Votre demande d’échantillon pour ${sampleButton.dataset.sample} est prête à être transmise à l’équipe Givaudan.`,
        );
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
        this.requestedField,
      );
      this.updateFromResponse(response);
      this.appendMessage('assistant', response.assistantMessage);
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
    this.requestedField = response.requestedField;
    this.renderBrief(response.brief);
    this.renderRecommendations(response.recommendations);
    this.resultsPanel.hidden = false;
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
        detail('Prix indicatif', `${item.price} €/kg`),
        detail('Volume minimum', `${item.minimumVolume} kg`),
      );

      const actions = document.createElement('div');
      actions.className = 'recommendation-actions';
      const detailButton = document.createElement('button');
      detailButton.type = 'button';
      detailButton.dataset.details = item.id;
      detailButton.textContent = 'Voir la fiche';
      const sampleButton = document.createElement('button');
      sampleButton.type = 'button';
      sampleButton.dataset.sample = item.name;
      sampleButton.textContent = 'Demander un échantillon';
      actions.append(detailButton, sampleButton);
      card.append(top, title, justification, details, actions);
      this.recommendations.append(card);
    });
  }

  private appendMessage(role: 'assistant' | 'user', text: string): void {
    const message = document.createElement('article');
    message.className = `conversation-message ${role}-message`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    message.append(paragraph);
    this.conversation.append(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    this.requestedField = null;
    this.conversation.replaceChildren();
    this.conversation.innerHTML =
      '<article class="conversation-message assistant-message"><p>Bonjour Julien ! Décrivez votre produit et je vous proposerai les références adaptées.</p></article>';
    this.renderBrief(this.brief);
    this.recommendations.replaceChildren();
    this.resultsPanel.hidden = true;
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
    if (page === 'order') this.updateQuantity(0);
  }

  private updateQuantity(delta: number): void {
    const quantity = this.root.querySelector<HTMLElement>('#order-quantity');
    const display = this.root.querySelector<HTMLElement>('#quantity-display');
    const summary = this.root.querySelector<HTMLElement>(
      '[data-summary-quantity]',
    );
    if (!quantity || !display || !summary) return;
    let value = Number(quantity.textContent);
    if (!Number.isFinite(value)) value = 0;
    if (delta === 0 && !Number.isFinite(Number(quantity.textContent))) {
      quantity.textContent = '[X]';
      display.textContent = '[X]';
      summary.textContent = '[X]';
      return;
    }
    value = Math.max(1, value + delta);
    const formatted =
      quantity.textContent === '[X]' && delta === 0 ? '[X]' : String(value);
    quantity.textContent = formatted;
    display.textContent = formatted;
    summary.textContent = formatted;
  }

  private editOrderField(field: string): void {
    const value = this.root.querySelector<HTMLElement>(
      `[data-value="${field}"]`,
    );
    if (!value) return;
    const labels: Record<string, string> = {
      format: 'Format de conditionnement',
      address: 'Adresse de livraison',
      internal: 'Référence interne',
    };
    const answer = window.prompt(
      `Modifier : ${labels[field] ?? field}`,
      value.textContent === '[Format proposé par la fiche]' ||
        value.textContent === '[Adresse de l’entreprise]' ||
        value.textContent === 'Ex. : lancement printemps'
        ? ''
        : (value.textContent ?? ''),
    );
    if (answer === null || !answer.trim()) return;
    value.textContent = answer.trim();
    if (field === 'format') {
      const summaryFormat = this.root.querySelector<HTMLElement>(
        '[data-summary-format]',
      );
      if (summaryFormat) summaryFormat.textContent = answer.trim();
    }
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

  private handlePageAction(action: string): void {
    const feedback = this.root.querySelector<HTMLElement>('#order-feedback');
    const trackingFeedback = this.root.querySelector<HTMLElement>(
      '#tracking-action-status',
    );
    const sampleFeedback = this.root.querySelector<HTMLElement>(
      '#feedback-confirmation',
    );
    if (action === 'place-order' && feedback) {
      feedback.textContent =
        'Votre commande est prête à être transmise. Prix et date seront confirmés par Givaudan.';
    } else if (action === 'expert' && (feedback || trackingFeedback)) {
      const activeFeedback = this.root.querySelector(
        '.tracking-view:not([hidden])',
      )
        ? trackingFeedback
        : feedback;
      if (activeFeedback) {
        activeFeedback.textContent =
          'Votre interlocuteur Givaudan peut vous accompagner.';
      }
    } else if (action === 'gesture') {
      this.showPage('order');
    } else if (action === 'feedback' && sampleFeedback) {
      sampleFeedback.textContent = 'Merci pour votre retour !';
    }
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
